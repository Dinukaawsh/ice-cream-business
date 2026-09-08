import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { asNumber, requireBusinessOwner } from "@/lib/owner-auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

const customerSchema = z.object({
  type: z.enum(["shop", "person"]),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

function mapCustomer(row: typeof customers.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    phone: row.phone,
    address: row.address,
    outstandingBalance: asNumber(row.outstandingBalance),
    returnCredit: asNumber(row.returnCredit),
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request);
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const type = request.nextUrl.searchParams.get("type");
    const db = getDb();
    const rows = await db
      .select()
      .from(customers)
      .where(
        type === "shop" || type === "person"
          ? and(
              eq(customers.businessId, session.businessId),
              eq(customers.type, type),
            )
          : eq(customers.businessId, session.businessId),
      )
      .orderBy(desc(customers.createdAt));

    return jsonResponse(
      { customers: rows.map(mapCustomer) },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return jsonResponse({ error: "Failed to load customers" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = customerSchema.parse(await request.json());
    const db = getDb();
    const [row] = await db
      .insert(customers)
      .values({
        businessId: session.businessId,
        type: body.type,
        name: body.name,
        phone: body.phone || null,
        address: body.address || null,
        isActive: body.isActive,
      })
      .returning();

    return jsonResponse(
      { customer: mapCustomer(row), message: "Customer created" },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid customer data" }, 400, origin);
    }
    console.error("POST /api/customers failed:", error);
    return jsonResponse({ error: "Failed to create customer" }, 500, origin);
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: "Invalid customer id" }, 400, origin);
  }

  try {
    const body = customerSchema.parse(await request.json());
    const db = getDb();
    const [row] = await db
      .update(customers)
      .set({
        type: body.type,
        name: body.name,
        phone: body.phone || null,
        address: body.address || null,
        isActive: body.isActive,
      })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, session.businessId),
        ),
      )
      .returning();

    if (!row) {
      return jsonResponse({ error: "Customer not found" }, 404, origin);
    }

    return jsonResponse(
      { customer: mapCustomer(row), message: "Customer updated" },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid customer data" }, 400, origin);
    }
    console.error("PATCH /api/customers failed:", error);
    return jsonResponse({ error: "Failed to update customer" }, 500, origin);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: "Invalid customer id" }, 400, origin);
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.businessId, session.businessId),
        ),
      )
      .returning({ id: customers.id });

    if (deleted.length === 0) {
      return jsonResponse({ error: "Customer not found" }, 404, origin);
    }

    return jsonResponse({ ok: true, message: "Customer deleted" }, 200, origin);
  } catch (error) {
    console.error("DELETE /api/customers failed:", error);
    return jsonResponse({ error: "Failed to delete customer" }, 500, origin);
  }
}
