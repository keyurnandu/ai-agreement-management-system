import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

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
    <main className="center-screen">
      <div className="card" style={{ width: 380 }}>
        <div className="brand">contract-platform</div>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          Sign in to continue
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
        <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          Local dev: seeded admin is <code>admin@local.test</code> / <code>Admin123!</code>
        </p>
      </div>
    </main>
  );
}
