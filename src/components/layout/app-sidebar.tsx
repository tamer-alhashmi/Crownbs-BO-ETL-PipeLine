import Link from "next/link";
import { FileSpreadsheet, LayoutDashboard, Settings, ShieldCheck } from "lucide-react";

export function AppSidebar({ active }: { active: "reports" | "settings" }) {
  return (
    <aside className="hidden w-[246px] shrink-0 flex-col border-r border-border bg-card px-4 py-5 text-card-foreground lg:flex">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <FileSpreadsheet className="h-[18px] w-[18px]" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[-0.015em]">Crown Business Solution</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Backoffice
          </p>
        </div>
      </Link>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Workspace
      </div>
      <nav className="mt-3 space-y-1" aria-label="Main navigation">
        <Link
          href="/"
          aria-current={active === "reports" ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            active === "reports"
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Reports
        </Link>
        <Link
          href="/settings"
          aria-current={active === "settings" ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            active === "settings"
              ? "bg-primary/10 font-semibold text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </nav>
      <div className="mt-auto rounded-2xl border border-border bg-muted p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <p className="mt-3 text-xs font-semibold">Private team access</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Access is limited to administrator-provisioned accounts.
        </p>
      </div>
    </aside>
  );
}
