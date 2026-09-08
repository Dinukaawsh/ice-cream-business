import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { businesses, emailVerificationTokens, users } from "@/db/schema";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import {
  createVerificationToken,
  hashToken,
  sendVerificationEmail,
} from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(128),
  address: z.string().trim().max(300).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ip = clientIp(request.headers);
    const limited = rateLimit(`register:${ip}`, 5, 15 * 60 * 1000);
    if (!limited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    const body = registerSchema.parse(await request.json());
    const passwordError = validatePasswordStrength(body.password);
    if (passwordError) {
      return jsonResponse({ error: passwordError }, 400, origin);
    }

    const email = body.email.toLowerCase();
    const db = getDb();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return jsonResponse({ error: "Unable to register with this email" }, 400, origin);
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      return jsonResponse(
        {
          error:
            "Email verification is not configured. Use Google/Facebook login, or set RESEND_API_KEY.",
        },
        503,
        origin,
      );
    }

    const passwordHash = await hashPassword(body.password);

    const [business] = await db
      .insert(businesses)
      .values({
        name: body.businessName,
        ownerName: body.name,
        address: body.address ?? "",
        phone: body.phone ?? "",
        email,
      })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: body.name,
        role: "business_owner",
        status: "pending_verification",
        authProvider: "password",
        businessId: business.id,
      })
      .returning();

    const token = createVerificationToken();
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await sendVerificationEmail(email, token);

    return jsonResponse(
      {
        ok: true,
        message: "Check your email to verify your account before logging in.",
      },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid registration data" }, 400, origin);
    }
    console.error("POST /api/auth/register failed:", error);
    return jsonResponse({ error: "Registration failed" }, 500, origin);
  }
}
