import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { BrandMark } from "@/components/Brand";

const HIGHLIGHTS = [
  "AI risk review on every contract",
  "E-signature with a full audit trail",
  "Renewals, cycle time & value at a glance",
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function authenticate(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      await signIn("credentials", { email, password, redirectTo: "/dashboard" });
    } catch (err) {
      // signIn throws a redirect on success — only swallow real auth errors.
      if (err instanceof AuthError) {
        redirect("/login?error=invalid");
      }
      throw err;
    }
  }

  return (
    <main className="login-split">
      <section className="login-hero">
        <div className="brand-lockup" style={{ fontSize: 20 }}>
          <BrandMark size={30} />
          <span className="brand-name" style={{ fontSize: 20 }}>
            Contract<span className="brand-iq">IQ</span>
          </span>
        </div>
        <div>
          <h1>Never sign a contract blind again.</h1>
          <p className="sub">
            PDF, e-signature, and AI contract intelligence in one platform — so sales, procurement,
            and legal teams understand every agreement before it&apos;s signed.
          </p>
          <div className="feat">
            {HIGHLIGHTS.map((h) => (
              <div className="feat-row" key={h}>
                <span className="tick" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                {h}
              </div>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          © {new Date().getFullYear()} ContractIQ · AI Contract Intelligence
        </p>
      </section>

      <section className="login-form-side">
        <div className="card login-card">
          <h2 style={{ margin: 0 }}>Sign in</h2>
          <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Welcome back — enter your credentials to continue.
          </p>
          <form action={authenticate}>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="input" id="email" name="email" type="email" required autoComplete="username" />
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            {error ? <div className="error">Invalid email or password.</div> : null}
            <button className="btn" type="submit" style={{ width: "100%", marginTop: 18 }}>
              Sign in
            </button>
          </form>
          <div className="dev-creds">
            <strong style={{ color: "var(--text-secondary)" }}>Demo login</strong> — <code>admin@local.test</code> / <code>Admin123!</code>
          </div>
        </div>
      </section>
    </main>
  );
}
