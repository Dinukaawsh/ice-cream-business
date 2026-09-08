"use client";

import { Modal } from "@/components/ui/Modal";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmClass =
    variant === "danger"
      ? "bg-[var(--ice-danger)] hover:bg-red-700"
      : "bg-[var(--ice-primary)] hover:bg-[var(--ice-primary-dark)]";

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-[var(--ice-border)] bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--ice-muted)]">{message}</p>
    </Modal>
  );
}
