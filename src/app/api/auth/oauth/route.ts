import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { getDb } from "@/db";
import { businesses, users } from "@/db/schema";
import { createToken, setTokenCookie } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import { notifyDiscordNewOwner } from "@/lib/discord";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const oauthSchema = z.object({
  provider: z.enum(["google", "facebook"]),
  idToken: z.string().min(20),
  businessName: z.string().trim().min(2).max(120).optional(),
});

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

async function verifyGoogleIdToken(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google email not verified");
  }
  return {
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || payload.email),
    subject: String(payload.sub),
  };
}

async function verifyFacebookToken(accessToken: string) {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set");
  }

  const debugUrl = new URL("https://graph.facebook.com/debug_token");
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const debugRes = await fetch(debugUrl);
  if (!debugRes.ok) {
    throw new Error("Facebook token debug failed");
  }
  const debugJson = (await debugRes.json()) as {
    data?: { is_valid?: boolean; user_id?: string; app_id?: string };
  };
  if (!debugJson.data?.is_valid || debugJson.data.app_id !== appId) {
    throw new Error("Invalid Facebook token");
  }

  const meUrl = new URL("https://graph.facebook.com/me");
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", accessToken);
  const meRes = await fetch(meUrl);
  if (!meRes.ok) {
    throw new Error("Facebook profile fetch failed");
  }
  const me = (await meRes.json()) as {
    id?: string;
    name?: string;
    email?: string;
  };
  if (!me.email || !me.id) {
    throw new Error("Facebook account must share a verified email");
  }
  return {
    email: me.email.toLowerCase(),
    name: me.name || me.email,
    subject: me.id,
  };
}

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
        : await verifyFacebookToken(body.idToken);

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
        error:
          error instanceof Error ? error.message : "OAuth login failed",
      },
      400,
      origin,
    );
  }
}
