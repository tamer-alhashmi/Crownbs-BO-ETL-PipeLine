"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const tableNameSchema = z.enum(["BookingsReport", "PaymentsReport"]);
const visibilitySchema = z
  .record(z.string().min(1).max(200), z.boolean())
  .refine((value) => Object.keys(value).length <= 250, "Too many table columns.");
const orderSchema = z
  .array(z.string().min(1).max(200))
  .max(250)
  .refine((value) => new Set(value).size === value.length, "Column order cannot contain duplicates.");

type Actor = { id: string; email: string };
type ActionFailure = { ok: false; error: string };
type SavedTableView = {
  id: string;
  name: string;
  tableName: string;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
};

async function getActor(): Promise<Actor | ActionFailure> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    return { ok: false, error: `Could not verify your session: ${error.message}` };
  }
  if (!data.user) return { ok: false, error: "Sign in to manage saved table views." };
  if (!data.user.email) return { ok: false, error: "Your account must have an email address to save table views." };
  return { id: data.user.id, email: data.user.email };
}

function toSavedTableView(view: {
  id: string;
  name: string;
  table_name: string;
  column_visibility: Prisma.JsonValue;
  column_order: Prisma.JsonValue;
}): SavedTableView {
  const visibility = visibilitySchema.safeParse(view.column_visibility);
  const order = orderSchema.safeParse(view.column_order);
  if (!visibility.success || !order.success) {
    throw new Error(`Saved table view "${view.name}" contains invalid column settings.`);
  }
  return {
    id: view.id,
    name: view.name,
    tableName: view.table_name,
    columnVisibility: visibility.data,
    columnOrder: order.data,
  };
}

export async function listTableViews(tableName: string) {
  const actor = await getActor();
  if ("ok" in actor) return actor;
  const parsedTableName = tableNameSchema.safeParse(tableName);
  if (!parsedTableName.success) return { ok: false as const, error: "Unsupported report table." };

  const views = await prisma.tableView.findMany({
    where: { user_id: actor.id, table_name: parsedTableName.data },
    orderBy: [{ name: "asc" }, { created_at: "asc" }],
    select: {
      id: true,
      name: true,
      table_name: true,
      column_visibility: true,
      column_order: true,
    },
  });
  return { ok: true as const, views: views.map(toSavedTableView) };
}

export async function getTableView(id: string, tableName: string) {
  const actor = await getActor();
  if ("ok" in actor) return actor;
  const parsedId = z.string().uuid().safeParse(id);
  const parsedTableName = tableNameSchema.safeParse(tableName);
  if (!parsedId.success || !parsedTableName.success) {
    return { ok: false as const, error: "Invalid saved view." };
  }

  const view = await prisma.tableView.findFirst({
    where: {
      id: parsedId.data,
      user_id: actor.id,
      table_name: parsedTableName.data,
    },
    select: {
      id: true,
      name: true,
      table_name: true,
      column_visibility: true,
      column_order: true,
    },
  });
  if (!view) return { ok: false as const, error: "That saved view is no longer available." };
  return { ok: true as const, view: toSavedTableView(view) };
}

export async function createTableView(input: {
  name: string;
  tableName: string;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
}) {
  const actor = await getActor();
  if ("ok" in actor) return actor;
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      tableName: tableNameSchema,
      columnVisibility: visibilitySchema,
      columnOrder: orderSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid saved view." };
  }

  const now = new Date();
  const view = await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: actor.id },
      create: {
        id: actor.id,
        email: actor.email,
        updated_at: now,
      },
      update: { email: actor.email },
    });
    return tx.tableView.create({
      data: {
        name: parsed.data.name,
        table_name: parsed.data.tableName,
        column_visibility: parsed.data.columnVisibility,
        column_order: parsed.data.columnOrder,
        user_id: actor.id,
      },
      select: { id: true, name: true, table_name: true },
    });
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  });

  if (!view) {
    return { ok: false as const, error: "A view with this name already exists for this table." };
  }
  return {
    ok: true as const,
    view: { id: view.id, name: view.name, tableName: view.table_name },
  };
}
