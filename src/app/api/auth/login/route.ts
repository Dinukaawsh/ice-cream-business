import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  createToken,
  setTokenCookie,
  verifyPassword,
} from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const ip = clientIp(request.headers);
    const limited = rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
    if (!limited.ok) {
      return jsonResponse({ error: "Too many requests" }, 429, origin);
    }

    const body = loginSchema.parse(await request.json());
    const email = body.email.toLowerCase();
    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      return jsonResponse({ error: "Invalid email or password" }, 401, origin);
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return jsonResponse({ error: "Invalid email or password" }, 401, origin);
    }

    if (user.status === "disabled") {
      return jsonResponse({ error: "Account is disabled" }, 403, origin);
    }

    if (user.status === "pending_verification") {
      return jsonResponse(
        { error: "Verify your email before logging in" },
        403,
        origin,
      );
    }

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

    return jsonResponse({ token, user: session }, 200, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid login data" }, 400, origin);
    }
    console.error("POST /api/auth/login failed:", error);
    return jsonResponse({ error: "Login failed" }, 500, origin);
  }
}
