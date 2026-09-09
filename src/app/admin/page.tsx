"use client";

import { useCallback, useEffect, useState } from "react";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";

type Owner = {
  id: number;
  email: string;
  name: string;
  status: string;
  authProvider: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  businessId: number | null;
  businessName: string | null;
};

type ConfirmAction =
  | { type: "disable"; owner: Owner }
  | { type: "enable"; owner: Owner }
  | { type: "delete"; owner: Owner };

export default function AdminOwnersPage() {
  const toast = useToast();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/owners");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load owners");
      }
      setOwners(data.owners ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runConfirm() {
    if (!confirm) return;
    setActionLoading(true);
    try {
      if (confirm.type === "disable" || confirm.type === "enable") {
        const status = confirm.type === "disable" ? "disabled" : "active";
        const response = await fetch(`/api/admin/owners?id=${confirm.owner.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Update failed");
        }
        toast.success(
          confirm.type === "disable"
            ? `${confirm.owner.name} disabled`
            : `${confirm.owner.name} enabled`,
        );
        setConfirm(null);
        await load();
        return;
      }

      const response = await fetch(`/api/admin/owners?id=${confirm.owner.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }
      toast.success(`${confirm.owner.name} deleted`);
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  const confirmCopy = (() => {
    if (!confirm) return null;
    if (confirm.type === "disable") {
      return {
        title: "Disable owner?",
        message: `${confirm.owner.name} (${confirm.owner.email}) will not be able to use the mobile app until enabled again.`,
        confirmLabel: "Disable",
        variant: "danger" as const,
      };
    }
    if (confirm.type === "enable") {
      return {
        title: "Enable owner?",
        message: `Restore access for ${confirm.owner.name} (${confirm.owner.email})?`,
        confirmLabel: "Enable",
        variant: "primary" as const,
      };
    }
    return {
      title: "Delete owner?",
      message: `Permanently delete ${confirm.owner.name} and their business data? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger" as const,
    };
  })();

  return (
    <>
      <div className="mb-4">
        <h2 className="text-xl font-bold">Registered owners</h2>
        <p className="text-sm text-[var(--ice-muted)]">
          Disable, enable, or remove business accounts.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--ice-border)] bg-white/90 shadow-lg shadow-blue-200/30">
        {loading ? (
          <p className="p-8 text-[var(--ice-muted)]">Loading...</p>
        ) : owners.length === 0 ? (
          <p className="p-8 text-[var(--ice-muted)]">No owners registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--ice-bg-deep)] text-[var(--ice-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Auth</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Registered</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => (
                  <tr
                    key={owner.id}
                    className="border-t border-[var(--ice-border)]"
                  >
                    <td className="px-4 py-3 font-medium">
                      {owner.businessName ?? "—"}
                    </td>
                    <td className="px-4 py-3">{owner.name}</td>
                    <td className="px-4 py-3">{owner.email}</td>
                    <td className="px-4 py-3 capitalize">{owner.authProvider}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          owner.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : owner.status === "disabled"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {owner.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(owner.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {owner.status !== "disabled" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirm({ type: "disable", owner })
                            }
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 transition hover:bg-red-50"
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirm({ type: "enable", owner })
                            }
                            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50"
                          >
                            Enable
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirm({ type: "delete", owner })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmCopy ? (
        <ConfirmModal
          open={confirm !== null}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          variant={confirmCopy.variant}
          loading={actionLoading}
          onConfirm={() => void runConfirm()}
          onCancel={() => {
            if (!actionLoading) setConfirm(null);
          }}
        />
      ) : null}
    </>
  );
}
