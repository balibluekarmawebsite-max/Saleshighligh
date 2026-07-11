import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  const authConfigured = !!process.env.AUTH_SECRET;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold tracking-tight text-primary-foreground">BK</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Blue Karma</p>
            <p className="text-xs text-muted-foreground">Sales Dashboard</p>
          </div>
        </div>
        <h1 className="mb-1 text-lg font-semibold text-foreground">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Access the internal analytics dashboard.</p>

        {authConfigured ? (
          <LoginForm googleEnabled={googleEnabled} />
        ) : (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Authentication isn&apos;t configured yet. Set <code>AUTH_SECRET</code> (and provider env vars) on the server to enable sign-in — see DEPLOY.md.
          </p>
        )}
      </div>
    </div>
  );
}
