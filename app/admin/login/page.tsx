"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Replaces the raw browser Basic-Auth popup with a real, styled page.
 * Still just the one shared ADMIN_SECRET — no accounts, no sign-up —
 * this only changes how you prove you have it.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Incorrect password.");
        setLoading(false);
        return;
      }
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "/admin/analytics";
      router.push(redirect);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-ink/10 bg-surface p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-ink">Priora Admin</h1>
        <p className="font-body mt-1 text-sm text-ink-soft">Enter the admin password to continue.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Password"
          className="font-body mt-6 h-12 w-full rounded-xl border border-ink/15 bg-background px-4 text-ink outline-none transition focus:border-ink/40"
        />

        {error && <p className="font-body mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="font-body mt-4 h-12 w-full cursor-pointer rounded-xl bg-ink text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Checking…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
