import type { ReactNode } from "react";

export function SummaryCard({
  label,
  value,
  change,
  icon,
  accent,
}: {
  label: string;
  value: string;
  change: string;
  icon: ReactNode;
  accent: "green" | "blue" | "amber" | "violet";
}) {
  const colors = {
    green: "bg-success/10 text-success",
    blue: "bg-primary/10 text-primary",
    amber: "bg-warning/10 text-warning",
    violet: "bg-accent text-accent-foreground",
  }[accent];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-[25px] font-semibold tracking-[-0.04em]">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors}`}>{icon}</div>
      </div>
      <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">{change}</p>
    </section>
  );
}
