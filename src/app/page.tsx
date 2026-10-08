import { AuthScreen } from "@/components/auth/auth-screen";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getReports, normalizeReportFilters } from "@/lib/reports/data";
import { createClient } from "@/lib/supabase/server";
import { getProfileAvatarUrl } from "@/lib/supabase/profile-avatar";
import { redirect } from "next/navigation";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const authErrorMessages: Record<string, string> = {
  signout: "We could not sign you out. Please try again.",
};

export default async function Home({ searchParams }: HomePageProps) {
  const [supabase, query] = await Promise.all([createClient(), searchParams]);
  const { data, error } = await supabase.auth.getUser();

  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error(`Unable to verify the current Supabase user: ${error.message}`);
  }

  const user = error ? null : data.user;

  if (!user) {
    const authError = Array.isArray(query.authError) ? query.authError[0] : query.authError;
    return (
      <AuthScreen
        authError={authError ? authErrorMessages[authError] : undefined}
        user={null}
      />
    );
  }

  const filters = normalizeReportFilters(query);
  if (typeof query.from !== "string" || typeof query.to !== "string") {
    const defaultParams = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.property) defaultParams.set("property", filters.property);
    redirect(`/?${defaultParams.toString()}`);
  }

  const [avatar, reportData] = await Promise.all([
    getProfileAvatarUrl(supabase, user),
    getReports(filters),
  ]);
  const identity = {
    email: user.email ?? "",
    fullName:
      typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null,
    avatarUrl: avatar.url,
  };

  return (
    <ReportsDashboard
      user={identity}
      bookings={reportData.bookings}
      payments={reportData.payments}
      paymentMethods={reportData.paymentMethods}
      properties={reportData.properties}
      filters={reportData.filters}
      bookingTotal={reportData.bookingTotal}
      paymentTotal={reportData.paymentTotal}
      bookingPageCount={reportData.bookingPageCount}
      paymentPageCount={reportData.paymentPageCount}
      summary={reportData.summary}
      dataNotice={reportData.notice}
    />
  );
}
