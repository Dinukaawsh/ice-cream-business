import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { businesses, users } from "@/db/schema";
import { createToken, setTokenCookie } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import { notifyDiscordNewOwner } from "@/lib/discord";
import {
  toOAuthUserError,
  verifyFacebookToken,
  verifyGoogleIdToken,
} from "@/lib/oauth-providers";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const oauthSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  idToken: z.string().min(20),
  businessName: z.string().trim().min(2).max(120).optional(),
  nonce: z.string().trim().min(8).max(128).optional(),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ip = clientIp(request.headers);
    const limited = rateLimit(`oauth:${ip}`, 30, 15 * 60 * 1000);
    if (!limited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    const body = oauthSchema.parse(await request.json());
    const profile =
      body.provider === "google"
        ? await verifyGoogleIdToken(body.idToken)
        : await verifyFacebookToken(body.idToken, body.nonce);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existing) {
      if (existing.status === "disabled") {
        return jsonResponse({ error: "Account is disabled" }, 403, origin);
      }
      if (existing.role === "platform_admin") {
        return jsonResponse({ error: "Use admin web login" }, 403, origin);
      }

      await db
        .update(users)
        .set({
          status: "active",
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          authProvider: body.provider,
          oauthSubject: profile.subject,
          name: existing.name || profile.name,
        })
        .where(eq(users.id, existing.id));

      const session = {
        id: existing.id,
        email: existing.email,
        name: existing.name || profile.name,
        role: existing.role,
        status: "active" as const,
        businessId: existing.businessId,
      };
      const token = await createToken(session);
      await setTokenCookie(token);
      return jsonResponse({ token, user: session }, 200, origin);
    }

    const businessName = body.businessName?.trim();
    if (!businessName) {
      return jsonResponse(
        {
          error: "businessName_required",
          message: "Provide a business name to finish registration",
          email: profile.email,
          name: profile.name,
        },
        409,
        origin,
      );
    }

    const [business] = await db
      .insert(businesses)
      .values({
        name: businessName,
        ownerName: profile.name,
        address: "",
        phone: "",
        email: profile.email,
      })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        email: profile.email,
        name: profile.name,
        role: "business_owner",
        status: "active",
        authProvider: body.provider,
        oauthSubject: profile.subject,
        emailVerifiedAt: new Date(),
        businessId: business.id,
      })
      .returning();

    await notifyDiscordNewOwner({
      businessName: business.name,
      email: user.email,
      authMethod: body.provider,
    });

    const session = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      businessId: user.businessId,
    };
    const token = await createToken(session);
    await setTokenCookie(token);
    return jsonResponse({ token, user: session }, 201, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid OAuth payload" }, 400, origin);
    }
    console.error("POST /api/auth/oauth failed:", error);
    return jsonResponse(
      {
        error: toOAuthUserError(error),
      },
      400,
      origin,
    );
  }
}
