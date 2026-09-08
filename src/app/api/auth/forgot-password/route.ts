import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { passwordResetOtps, users } from "@/db/schema";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import {
  createPasswordResetOtp,
  hashToken,
  sendPasswordResetOtpEmail,
} from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email(),
});

const GENERIC_MESSAGE =
  "If an account exists for that email, a reset code has been sent.";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ip = clientIp(request.headers);
    const limited = rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
    if (!limited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase();

    if (!process.env.RESEND_API_KEY?.trim()) {
      return jsonResponse(
        { error: "Email service is not configured (RESEND_API_KEY)" },
        503,
        origin,
      );
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always same response to avoid email enumeration.
    if (
      !user ||
      user.status === "disabled" ||
      user.role === "platform_admin" ||
      !user.passwordHash
    ) {
      return jsonResponse({ ok: true, message: GENERIC_MESSAGE }, 200, origin);
    }

    const emailLimited = rateLimit(`forgot-email:${email}`, 3, 15 * 60 * 1000);
    if (!emailLimited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    await db
      .delete(passwordResetOtps)
      .where(eq(passwordResetOtps.userId, user.id));

    const otp = createPasswordResetOtp();
    await db.insert(passwordResetOtps).values({
      userId: user.id,
      otpHash: hashToken(otp),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    });

    await sendPasswordResetOtpEmail(email, otp);

    return jsonResponse({ ok: true, message: GENERIC_MESSAGE }, 200, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid email" }, 400, origin);
    }
    console.error("POST /api/auth/forgot-password failed:", error);
    return jsonResponse({ error: "Could not process request" }, 500, origin);
  }
}
