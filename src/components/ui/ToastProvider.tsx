"use client";

import toast, { Toaster } from "react-hot-toast";

type ToastType = "success" | "error";

const toastApi = {
  show(message: string, type: ToastType = "success") {
    if (type === "error") {
      toast.error(message);
      return;
    }
    toast.success(message);
  },
  success(message: string) {
    toast.success(message);
  },
  error(message: string) {
    toast.error(message);
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        gutter={12}
        containerStyle={{ top: 20 }}
        toastOptions={{
          duration: 3600,
          className: "ice-hot-toast",
          success: {
            className: "ice-hot-toast ice-hot-toast-success",
          },
          error: {
            className: "ice-hot-toast ice-hot-toast-error",
          },
        }}
      />
    </>
  );
}

export function useToast() {
  return toastApi;
}
