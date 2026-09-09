"use client";

import { FormEvent, useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { useToast } from "@/components/ui/ToastProvider";

export default function DownloadAppPage() {
  const toast = useToast();
  const [brandName, setBrandName] = useState("Scooply");
  const [enabled, setEnabled] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    void fetch("/api/app-download/info")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed");
        setBrandName(data.info?.brandName ?? "Scooply");
        setEnabled(Boolean(data.info?.enabled));
      })
      .catch(() => undefined)
      .finally(() => setLoadingInfo(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/app-download/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }
      setAuthenticated(true);
      toast.success("Access granted — you can download the APK");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid username or password",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    window.location.href = "/api/app-download/apk";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#dbeafe_0%,#f0f9ff_45%,#ecfeff_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-sky-100 bg-white/95 p-8 shadow-xl shadow-sky-200/50">
        <div className="flex items-center gap-3">
          <BrandMark size={48} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              {brandName}
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              Download the app
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Enter the username and password from your Scooply partner message to
          download the Android APK.
        </p>

        {loadingInfo ? (
          <p className="mt-6 text-sm text-slate-500">Loading…</p>
        ) : !enabled ? (
          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            App download is not configured yet. Ask the Scooply admin to set the
            APK link and password.
          </div>
        ) : authenticated ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Signed in. Tap below to download the APK.
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-300/50 transition hover:bg-sky-700"
            >
              Download APK
            </button>
            <p className="text-center text-xs text-slate-500">
              Access expires in about 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-800">
              Username
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-sky-300/50 transition hover:bg-sky-700 disabled:opacity-60"
            >
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
