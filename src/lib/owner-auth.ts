import { NextRequest } from "next/server";

import { getSessionFromRequest, type SessionUser } from "@/lib/auth";

export async function requireBusinessOwner(
  request: NextRequest,
  options?: { requireActive?: boolean },
): Promise<SessionUser | null> {
  const session = await getSessionFromRequest(request);
  if (
    !session ||
    session.role !== "business_owner" ||
    !session.businessId ||
    session.status === "disabled"
  ) {
    return null;
  }
  if (options?.requireActive && session.status !== "active") {
    return null;
  }
  return session;
}

export function money(value: number) {
  return value.toFixed(2);
}

export function asNumber(value: string | number | null | undefined) {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
