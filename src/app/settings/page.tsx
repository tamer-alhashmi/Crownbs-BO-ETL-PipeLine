import { ArrowDownToLine, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DriveSyncButton } from "@/components/reports/drive-sync-button";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { ThemeSettings } from "@/components/theme/theme-settings";
import { createClient } from "@/lib/supabase/server";
import { getProfileAvatarUrl } from "@/lib/supabase/profile-avatar";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error(`Unable to verify the current Supabase user: ${error.message}`);
  }
  if (error || !data.user) redirect("/");

  const user = data.user;
  const fullName =
    typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null;
  const phone =
    typeof user.user_metadata.phone === "string" ? user.user_metadata.phone : "";
  const address =
    typeof user.user_metadata.address === "string" ? user.user_metadata.address : "";
  const avatar = await getProfileAvatarUrl(supabase, user);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <AppSidebar active="settings" />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border bg-card/95 px-4 text-card-foreground backdrop-blur sm:px-7 lg:px-9">
            <div>
              <p className="hidden text-[11px] font-medium text-muted-foreground sm:block">
                Crown Business Solution / Settings
              </p>
              <h1 className="text-sm font-semibold sm:mt-0.5">Settings</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-xs font-semibold">{fullName || user.email}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Team member</p>
              </div>
              <Link
                href="/"
                className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Reports
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </header>
          <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-7 lg:px-9">
            <div className="mb-7">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Preferences
              </p>
              <h2 className="text-[27px] font-semibold tracking-[-0.04em] sm:text-[32px]">
                Settings
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Manage your appearance preferences for the backoffice.
              </p>
            </div>
            <ProfileSettings
              email={user.email ?? ""}
              fullName={fullName ?? ""}
              phone={phone}
              address={address}
              avatarUrl={avatar.url}
              avatarError={avatar.error}
            />
            <div className="mt-5">
              <ThemeSettings />
            </div>
            <section className="mt-5 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ArrowDownToLine className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Data synchronization</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Automatically fetch and process the latest CSV reports for Bookings and
                    Payments (H&amp;H, Harbor, and Orlando) from the connected Google Drive folder.
                    This action ensures your dashboard reflects real-time financial data without
                    manual entry.
                  </p>
                </div>
              </div>
              <DriveSyncButton />
            </section>
            <section className="mt-5 rounded-2xl border border-danger/30 bg-card p-5 text-card-foreground shadow-sm sm:p-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Account management</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sign out of your Crown Business Solution account on this device.
                  </p>
                </div>
              </div>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-medium text-danger transition hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
