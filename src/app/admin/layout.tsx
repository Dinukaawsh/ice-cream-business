"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";

const NAV = [
  { href: "/admin", label: "Owners" },
  { href: "/admin/app-download", label: "App download" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/auth/me");
        if (!me.ok) {
          router.replace("/login");
          return;
        }
        const data = await me.json();
        if (data.user?.role !== "platform_admin") {
          router.replace("/login");
          return;
        }
        setReady(true);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/me", { method: "POST" });
      toast.success("Logged out");
      router.replace("/login");
    } catch {
      toast.error("Logout failed");
    } finally {
      setLoggingOut(false);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4">
        <p className="text-[var(--ice-muted)]">Loading admin…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <BrandMark size={40} />
          <h1 className="mt-3 text-3xl font-bold">Platform admin</h1>
          <p className="text-sm text-[var(--ice-muted)]">
            Manage owners and share the Scooply Android APK.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLogoutOpen(true)}
          className="rounded-xl border border-[var(--ice-border)] bg-white px-4 py-2 text-sm font-medium transition hover:bg-[var(--ice-bg-deep)]"
        >
          Log out
        </button>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--ice-primary)] text-white shadow-md shadow-blue-300/40"
                  : "border border-[var(--ice-border)] bg-white text-[var(--ice-ink)] hover:bg-[var(--ice-bg-deep)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}

      <ConfirmModal
        open={logoutOpen}
        title="Log out?"
        message="You will need to sign in again to manage the platform."
        confirmLabel="Log out"
        variant="danger"
        loading={loggingOut}
        onConfirm={() => void logout()}
        onCancel={() => {
          if (!loggingOut) setLogoutOpen(false);
        }}
      />
    </main>
  );
}
