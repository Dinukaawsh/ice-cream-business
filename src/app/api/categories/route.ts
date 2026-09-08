import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

function requireOwner(request: NextRequest) {
  return getSessionFromRequest(request).then((session) => {
    if (
      !session ||
      session.role !== "business_owner" ||
      !session.businessId ||
      session.status === "disabled"
    ) {
      return null;
    }
    return session;
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireOwner(request);
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.businessId, session.businessId))
      .orderBy(desc(categories.createdAt));

    return jsonResponse(
      {
        categories: rows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt,
        })),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/categories failed:", error);
    return jsonResponse({ error: "Failed to load categories" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireOwner(request);
  if (!session?.businessId || session.status !== "active") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = createSchema.parse(await request.json());
    const db = getDb();
    const [row] = await db
      .insert(categories)
      .values({
        businessId: session.businessId,
        name: body.name,
      })
      .returning();

    return jsonResponse(
      {
        category: { id: row.id, name: row.name, createdAt: row.createdAt },
        message: "Category created",
      },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid category data" }, 400, origin);
    }
    console.error("POST /api/categories failed:", error);
    return jsonResponse({ error: "Failed to create category" }, 500, origin);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireOwner(request);
  if (!session?.businessId || session.status !== "active") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: "Invalid category id" }, 400, origin);
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(categories)
      .where(
        and(
          eq(categories.id, id),
          eq(categories.businessId, session.businessId),
        ),
      )
      .returning({ id: categories.id });

    if (deleted.length === 0) {
      return jsonResponse({ error: "Category not found" }, 404, origin);
    }

    return jsonResponse({ ok: true, message: "Category deleted" }, 200, origin);
  } catch (error) {
    console.error("DELETE /api/categories failed:", error);
    return jsonResponse({ error: "Failed to delete category" }, 500, origin);
  }
}
