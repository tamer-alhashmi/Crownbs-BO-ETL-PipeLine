"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

type AuthScreenProps = {
  user: { email: string; fullName: string | null } | null;
  authError?: string;
};

type AuthMethod = "password" | "pin";

const emailSchema = z.email("Enter a valid email address.");
const pinSchema = z.string().regex(/^\d{6}$/, "Enter your 6-digit PIN.");

export function AuthScreen({ user, authError }: AuthScreenProps) {
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>("password");
  const [email, setEmail] = useState(user?.email ?? "");
  const [credential, setCredential] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState(authError ?? "");

  function resetFeedback() {
    setErrorMessage("");
  }

  function switchMethod(nextMethod: AuthMethod) {
    resetFeedback();
    setMethod(nextMethod);
    setCredential("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const validEmail = emailSchema.safeParse(email.trim());
    if (!validEmail.success) {
      setErrorMessage(validEmail.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    const validCredential =
      method === "pin"
        ? pinSchema.safeParse(credential)
        : z.string().min(1, "Enter your password.").safeParse(credential);
    if (!validCredential.success) {
      setErrorMessage(validCredential.error.issues[0]?.message ?? "Check your credentials.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: validEmail.data,
        password: validCredential.data,
      });
      if (error) throw error;
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Sign-in failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col xl:px-20">
          <div className="absolute -right-36 top-40 h-[34rem] w-[34rem] rounded-full border border-white/[0.08]" />
          <div className="absolute -right-20 top-56 h-[26rem] w-[26rem] rounded-full border border-white/[0.08]" />
          <div className="absolute -bottom-48 -left-32 h-[34rem] w-[34rem] rounded-full bg-primary-foreground/[0.08] blur-3xl" />

          <Brand light />

          <div className="relative z-10 my-auto max-w-xl pb-10 pt-24">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary-foreground/15 bg-primary-foreground/[0.06] px-3.5 py-2 text-xs font-medium text-primary-foreground/85">
              <ShieldCheck className="h-3.5 w-3.5 text-primary-foreground" />
              Crown Business Solution operations, in focus
            </div>
            <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[3.65rem]">
              The clearer view of your booking business.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-primary-foreground/80">
              Bring booking and payment files together, reconcile with confidence, and keep every
              number traceable from source to report.
            </p>

            <div className="mt-12 grid max-w-lg grid-cols-2 gap-3">
              <FeatureCard
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Unified reporting"
                detail="Bookings and payments, together"
              />
              <FeatureCard
                icon={<CircleDollarSign className="h-4 w-4" />}
                title="Precise by design"
                detail="Reliable financial records"
              />
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-primary-foreground/10 pt-5 text-xs text-primary-foreground/75">
            <span>Private team access</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure sign-in
            </span>
          </div>
        </section>

        <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12 xl:px-20">
          <div className="lg:hidden">
            <Brand />
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
            {user ? (
              <SignedInView user={user} />
            ) : (
              <div className="animate-in fade-in duration-500">
                <div className="mb-8">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Welcome to Crown Business Solution</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                    Sign in to continue
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Access secure reports and import tools.
                  </p>
                </div>

                <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Account access">
                  <button
                    type="button"
                    role="tab"
                    id="password-tab"
                    aria-controls="password-panel"
                    aria-selected={method === "password"}
                    onClick={() => switchMethod("password")}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${method === "password" ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Email &amp; Password
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="pin-tab"
                    aria-controls="pin-panel"
                    aria-selected={method === "pin"}
                    onClick={() => switchMethod("pin")}
                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${method === "pin" ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Email &amp; PIN
                  </button>
                </div>

                <form
                  id={method === "password" ? "password-panel" : "pin-panel"}
                  role="tabpanel"
                  aria-labelledby={method === "password" ? "password-tab" : "pin-tab"}
                  className="space-y-4"
                  onSubmit={handleSubmit}
                >
                  <Field label="Email address" htmlFor="login-email">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="username"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@company.com"
                        className="auth-input pl-10"
                      />
                    </div>
                  </Field>
                  <Field
                    label={method === "password" ? "Password" : "6-digit PIN"}
                    htmlFor="login-credential"
                  >
                    <input
                      id="login-credential"
                      type={method === "password" ? "password" : "password"}
                      inputMode={method === "pin" ? "numeric" : undefined}
                      autoComplete={method === "password" ? "current-password" : "off"}
                      maxLength={method === "pin" ? 6 : undefined}
                      pattern={method === "pin" ? "[0-9]{6}" : undefined}
                      required
                      value={credential}
                      onChange={(event) =>
                        setCredential(
                          method === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value,
                        )
                      }
                      placeholder={method === "pin" ? "Enter your 6-digit PIN" : "Enter your password"}
                      className={`auth-input ${method === "pin" ? "text-center text-lg tracking-[0.45em]" : ""}`}
                    />
                  </Field>
                  {method === "pin" && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Use the 6-digit PIN assigned by your administrator.
                    </p>
                  )}
                  <SubmitButton pending={pending}>Sign in securely</SubmitButton>
                </form>

                {errorMessage && (
                  <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm leading-5 text-danger" role="alert">
                    {errorMessage}
                  </p>
                )}
                <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
                  Access is restricted to accounts provisioned by your administrator.
                </p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Crown Business Solution</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Protected access
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`relative z-10 flex items-center gap-3 ${light ? "text-primary-foreground" : "text-foreground"}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${light ? "bg-primary-foreground/10 text-primary-foreground" : "bg-primary text-primary-foreground"}`}>
        <BarChart3 className="h-[19px] w-[19px]" strokeWidth={2.3} />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-[-0.015em]">Crown Business Solution</p>
        <p className={`text-[10px] font-medium uppercase tracking-[0.18em] ${light ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          Backoffice
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.11] bg-white/[0.055] p-4 backdrop-blur-sm">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/10 text-primary-foreground">
        {icon}
      </div>
      <p className="text-sm font-semibold text-primary-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-primary-foreground/75">{detail}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : children}
      {!pending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </button>
  );
}

function SignedInView({ user }: { user: NonNullable<AuthScreenProps["user"]> }) {
  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">Secure session active</p>
      <h2 className="text-3xl font-semibold tracking-[-0.04em]">
        You&apos;re signed in{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}.
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your account is connected and ready to use with Crown Business Solution.
      </p>

      <div className="mt-7 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Signed in as</p>
          <p className="truncate pt-0.5 text-sm font-semibold">{user.email}</p>
        </div>
        <Check className="ml-auto h-4 w-4 shrink-0 text-success" />
      </div>

      <div className="mt-5 rounded-xl bg-muted p-4">
        <div className="flex items-start gap-3">
          <ArrowDownToLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold">Your reports are being prepared</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Reports and file imports will appear here as the next project modules are added.
            </p>
          </div>
        </div>
      </div>

      <form action="/auth/signout" method="post" className="mt-7">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-card-foreground transition hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
