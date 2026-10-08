"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

let client: SupabaseClient | undefined;

export function createClient() {
  if (client) return client;

  const { url, publishableKey } = getSupabasePublicEnv();
  client = createBrowserClient(url, publishableKey);
  return client;
}
