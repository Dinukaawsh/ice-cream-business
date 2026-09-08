"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";

function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (verified) {
      toast.success("Email verified. You can log in on the mobile app.");
    }
  }, [verified, toast]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }
      if (data.user?.role !== "platform_admin") {
        throw new Error("Admin web is for platform admins only");
      }
      toast.success("Signed in");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-3xl border border-[var(--ice-border)] bg-white/90 p-8 shadow-xl shadow-blue-200/40 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--ice-primary)]">
          Ice Cream
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--ice-ink)]">
          Platform admin
        </h1>
        <p className="mt-2 text-sm text-[var(--ice-muted)]">
          Manage registered ice cream business owners.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--ice-border)] px-3 py-2.5 outline-none ring-[var(--ice-primary)] focus:ring-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--ice-border)] px-3 py-2.5 outline-none ring-[var(--ice-primary)] focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--ice-primary)] px-4 py-3 font-semibold text-white transition hover:bg-[var(--ice-primary-dark)] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-center">Loading...</main>}>
      <LoginForm />
    </Suspense>
  );
}
