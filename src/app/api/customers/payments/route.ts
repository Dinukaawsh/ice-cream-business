import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { customerPayments, customers } from "@/db/schema";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";
import { asNumber, money, requireBusinessOwner } from "@/lib/owner-auth";

const paySchema = z.object({
  customerId: z.number().int().positive(),
  amount: z.coerce.number().positive().max(1_000_000),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request);
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const customerId = Number(request.nextUrl.searchParams.get("customerId"));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return jsonResponse({ error: "Invalid customer id" }, 400, origin);
  }

  try {
    const db = getDb();
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.businessId, session.businessId),
        ),
      )
      .limit(1);
    if (!customer) {
      return jsonResponse({ error: "Customer not found" }, 404, origin);
    }

    const rows = await db
      .select()
      .from(customerPayments)
      .where(
        and(
          eq(customerPayments.customerId, customerId),
          eq(customerPayments.businessId, session.businessId),
        ),
      )
      .orderBy(desc(customerPayments.createdAt))
      .limit(50);

    return jsonResponse(
      {
        payments: rows.map((row) => ({
          id: row.id,
          customerId: row.customerId,
          amount: asNumber(row.amount),
          notes: row.notes,
          createdAt: row.createdAt,
        })),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/customers/payments failed:", error);
    return jsonResponse({ error: "Failed to load payments" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = paySchema.parse(await request.json());
    const db = getDb();
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, body.customerId),
          eq(customers.businessId, session.businessId),
        ),
      )
      .limit(1);

    if (!customer) {
      return jsonResponse({ error: "Customer not found" }, 404, origin);
    }

    const due = asNumber(customer.outstandingBalance);
    if (due <= 0) {
      return jsonResponse(
        { error: "This customer has no unpaid amount." },
        400,
        origin,
      );
    }
    if (body.amount > due + 0.009) {
      return jsonResponse(
        {
          error: `Payment is more than the unpaid amount (LKR ${due.toFixed(0)}).`,
        },
        400,
        origin,
      );
    }

    const remaining = Math.max(0, due - body.amount);
    await db.insert(customerPayments).values({
      businessId: session.businessId,
      customerId: customer.id,
      amount: money(body.amount),
      notes: body.notes || null,
    });
    const [updated] = await db
      .update(customers)
      .set({ outstandingBalance: money(remaining) })
      .where(eq(customers.id, customer.id))
      .returning();

    return jsonResponse(
      {
        customer: {
          id: updated.id,
          type: updated.type,
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          outstandingBalance: asNumber(updated.outstandingBalance),
          returnCredit: asNumber(updated.returnCredit),
          isActive: updated.isActive,
        },
        message:
          remaining > 0
            ? `Payment recorded. Still unpaid: LKR ${remaining.toFixed(0)}`
            : "Payment recorded. Balance is clear.",
      },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid payment data" }, 400, origin);
    }
    console.error("POST /api/customers/payments failed:", error);
    return jsonResponse({ error: "Failed to record payment" }, 500, origin);
  }
}
