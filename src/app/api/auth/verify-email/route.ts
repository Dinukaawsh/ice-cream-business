import { and, eq, gt } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDb } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { notifyDiscordNewOwner } from "@/lib/discord";
import { hashToken } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return jsonResponse({ error: "Missing token" }, 400, origin);
    }

    const db = getDb();
    const tokenHash = hashToken(token);
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      return jsonResponse({ error: "Invalid or expired token" }, 400, origin);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);

    if (!user) {
      return jsonResponse({ error: "User not found" }, 404, origin);
    }

    await db
      .update(users)
      .set({
        status: "active",
        emailVerifiedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));

    if (user.businessId) {
      const { businesses } = await import("@/db/schema");
      const [business] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, user.businessId))
        .limit(1);

      await notifyDiscordNewOwner({
        businessName: business?.name ?? "Unknown",
        email: user.email,
        authMethod: "email",
      });
    }

    const redirectUrl = `${getAppUrl()}/login?verified=1`;
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error("GET /api/auth/verify-email failed:", error);
    return jsonResponse({ error: "Verification failed" }, 500, origin);
  }
}
