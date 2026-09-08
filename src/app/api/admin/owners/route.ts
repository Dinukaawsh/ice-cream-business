import { and, desc, eq, ne } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { businesses, users } from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

async function requirePlatformAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "platform_admin") {
    return null;
  }
  return session;
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const admin = await requirePlatformAdmin(request);
  if (!admin) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      authProvider: users.authProvider,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      businessId: users.businessId,
      businessName: businesses.name,
    })
    .from(users)
    .leftJoin(businesses, eq(users.businessId, businesses.id))
    .where(ne(users.role, "platform_admin"))
    .orderBy(desc(users.createdAt));

  return jsonResponse({ owners: rows }, 200, origin);
}

const patchSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  const admin = await requirePlatformAdmin(request);
  if (!admin) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResponse({ error: "Invalid id" }, 400, origin);
    }

    const body = patchSchema.parse(await request.json());
    const db = getDb();

    const [updated] = await db
      .update(users)
      .set({ status: body.status })
      .where(and(eq(users.id, id), ne(users.role, "platform_admin")))
      .returning({
        id: users.id,
        email: users.email,
        status: users.status,
      });

    if (!updated) {
      return jsonResponse({ error: "Owner not found" }, 404, origin);
    }

    return jsonResponse({ owner: updated }, 200, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid payload" }, 400, origin);
    }
    console.error("PATCH /api/admin/owners failed:", error);
    return jsonResponse({ error: "Update failed" }, 500, origin);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const admin = await requirePlatformAdmin(request);
  if (!admin) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return jsonResponse({ error: "Invalid id" }, 400, origin);
    }

    const db = getDb();
    const [owner] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), ne(users.role, "platform_admin")))
      .limit(1);

    if (!owner) {
      return jsonResponse({ error: "Owner not found" }, 404, origin);
    }

    await db.delete(users).where(eq(users.id, owner.id));
    if (owner.businessId) {
      await db.delete(businesses).where(eq(businesses.id, owner.businessId));
    }

    return jsonResponse({ ok: true }, 200, origin);
  } catch (error) {
    console.error("DELETE /api/admin/owners failed:", error);
    return jsonResponse({ error: "Delete failed" }, 500, origin);
  }
}
