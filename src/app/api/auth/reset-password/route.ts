import { and, eq, gt } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { passwordResetOtps, users } from "@/db/schema";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import { hashToken } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(10).max(128),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ip = clientIp(request.headers);
    const limited = rateLimit(`reset:${ip}`, 10, 15 * 60 * 1000);
    if (!limited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    const body = schema.parse(await request.json());
    const passwordError = validatePasswordStrength(body.password);
    if (passwordError) {
      return jsonResponse({ error: passwordError }, 400, origin);
    }

    const email = body.email.toLowerCase();
    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.status === "disabled" || !user.passwordHash) {
      return jsonResponse({ error: "Invalid or expired code" }, 400, origin);
    }

    const [otpRow] = await db
      .select()
      .from(passwordResetOtps)
      .where(
        and(
          eq(passwordResetOtps.userId, user.id),
          gt(passwordResetOtps.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!otpRow) {
      return jsonResponse({ error: "Invalid or expired code" }, 400, origin);
    }

    if (otpRow.attempts >= 5) {
      await db
        .delete(passwordResetOtps)
        .where(eq(passwordResetOtps.userId, user.id));
      return jsonResponse(
        { error: "Too many invalid attempts. Request a new code." },
        400,
        origin,
      );
    }

    const matches = otpRow.otpHash === hashToken(body.otp);
    if (!matches) {
      await db
        .update(passwordResetOtps)
        .set({ attempts: otpRow.attempts + 1 })
        .where(eq(passwordResetOtps.id, otpRow.id));
      return jsonResponse({ error: "Invalid or expired code" }, 400, origin);
    }

    const passwordHash = await hashPassword(body.password);
    await db
      .update(users)
      .set({
        passwordHash,
        status: user.status === "pending_verification" ? "active" : user.status,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      })
      .where(eq(users.id, user.id));

    await db
      .delete(passwordResetOtps)
      .where(eq(passwordResetOtps.userId, user.id));

    return jsonResponse(
      { ok: true, message: "Password updated. You can sign in now." },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid reset data" }, 400, origin);
    }
    console.error("POST /api/auth/reset-password failed:", error);
    return jsonResponse({ error: "Could not reset password" }, 500, origin);
  }
}
