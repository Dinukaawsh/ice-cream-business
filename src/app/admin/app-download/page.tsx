"use client";

import { useCallback, useEffect, useState } from "react";

import { buildAppDownloadPartnerMessage } from "@/lib/app-download-message";
import { useToast } from "@/components/ui/ToastProvider";

type AppDownloadSettings = {
  username: string | null;
  hasPassword: boolean;
  downloadUrl: string | null;
  enabled: boolean;
  shareUrl: string;
};

export default function AdminAppDownloadPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<AppDownloadSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [knownPassword, setKnownPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/app-download");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load settings");
      }
      const next = data.settings as AppDownloadSettings;
      setSettings(next);
      setUsername(next.username ?? "");
      setDownloadUrl(next.downloadUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/app-download", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password: password.trim() || undefined,
          downloadUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Save failed");
      }
      const next = data.settings as AppDownloadSettings;
      setSettings(next);
      if (password.trim()) {
        setKnownPassword(password.trim());
      }
      setPassword("");
      toast.success("App download settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyShareUrl() {
    if (!settings?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(settings.shareUrl);
      toast.success("Download page link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  async function copyMessage(passwordOverride?: string) {
    const resolvedPassword =
      passwordOverride?.trim() || knownPassword.trim() || password.trim();
    const user = (username || settings?.username || "").trim();
    const shareUrl = settings?.shareUrl?.trim();

    if (!shareUrl || !user) {
      toast.error("Save username and APK link first");
      return;
    }
    if (!resolvedPassword) {
      toast.error(
        "Enter the password once (or save a new one) so we can include it in the message",
      );
      return;
    }

    const message = buildAppDownloadPartnerMessage({
      shareUrl,
      username: user,
      password: resolvedPassword,
    });

    try {
      await navigator.clipboard.writeText(message);
      setKnownPassword(resolvedPassword);
      toast.success("Partner instructions copied");
    } catch {
      toast.error("Could not copy message");
    }
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-xl font-bold">App download</h2>
        <p className="text-sm text-[var(--ice-muted)]">
          Password-protect a public link so partners can download the Scooply
          APK from Google Drive.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-[var(--ice-border)] bg-white/90 p-6 shadow-lg shadow-blue-200/30">
          <h3 className="text-lg font-semibold">Share</h3>
          <p className="mt-1 text-sm text-[var(--ice-muted)]">
            Send this page link with username and password.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-[var(--ice-muted)]">Loading…</p>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                  Public page
                </p>
                <p className="mt-1 break-all text-sm font-medium text-[var(--ice-ink)]">
                  {settings?.shareUrl ?? "—"}
                </p>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => void copyShareUrl()}
                    className="rounded-xl border border-[var(--ice-border)] bg-white px-3 py-2 text-sm font-semibold transition hover:bg-[var(--ice-bg-deep)]"
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyMessage()}
                    className="rounded-xl bg-[var(--ice-primary)] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95"
                  >
                    Copy message for partner
                  </button>
                  <p className="text-[11px] leading-snug text-[var(--ice-muted)]">
                    Message includes link, username, password, and install
                    steps. Password is only available after you type/save it in
                    this session.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--ice-border)] bg-[var(--ice-bg-deep)]/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ice-muted)]">
                    Username
                  </p>
                  <p className="mt-1 font-medium">
                    {settings?.username || "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--ice-border)] bg-[var(--ice-bg-deep)]/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ice-muted)]">
                    Status
                  </p>
                  <p className="mt-1 font-medium">
                    {settings?.enabled ? "Ready" : "Not configured"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[var(--ice-border)] bg-white/90 p-6 shadow-lg shadow-blue-200/30">
          <h3 className="text-lg font-semibold">Configure</h3>
          <p className="mt-1 text-sm text-[var(--ice-muted)]">
            Paste a Google Drive share link to the APK (anyone-with-link).
          </p>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium">
              Download username
              <input
                className="mt-1.5 w-full rounded-xl border border-[var(--ice-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ice-primary)] focus:ring-2"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="partner"
                autoComplete="off"
              />
            </label>

            <label className="block text-sm font-medium">
              {settings?.hasPassword
                ? "New password (leave blank to keep current)"
                : "Password"}
              <input
                type="password"
                className="mt-1.5 w-full rounded-xl border border-[var(--ice-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ice-primary)] focus:ring-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={settings?.hasPassword ? undefined : 6}
                required={!settings?.hasPassword}
                autoComplete="new-password"
              />
            </label>

            <label className="block text-sm font-medium">
              APK / Google Drive link
              <input
                className="mt-1.5 w-full rounded-xl border border-[var(--ice-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ice-primary)] focus:ring-2"
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                autoComplete="off"
              />
            </label>
            <p className="text-xs text-[var(--ice-muted)]">
              Drive file links are converted to a direct download. Direct APK
              URLs also work.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => void save()}
                className="rounded-xl bg-[var(--ice-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void copyMessage(password)}
                className="rounded-xl border border-[var(--ice-border)] bg-white px-4 py-2.5 text-sm font-semibold"
              >
                Copy message
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
