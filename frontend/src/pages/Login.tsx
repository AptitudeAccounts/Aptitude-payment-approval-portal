import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiPost("/auth/login", { email, password });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/assets/logo.jpg" alt="Aptitude" className="mx-auto mb-4 h-10 w-auto" />
          <h1 className="font-display text-2xl font-semibold text-ink">Payment Approvals</h1>
          <p className="mt-1 text-sm text-slate">Sign in to review requests</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate/15 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate/25 px-3 py-2 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-reject">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate">
          Secured connection · Multi-factor authentication available for admins
        </p>
      </div>
    </div>
  );
}
