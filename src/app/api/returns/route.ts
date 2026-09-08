import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  customers,
  productReturnItems,
  productReturns,
  productVariants,
  products,
} from "@/db/schema";
import { asNumber, money, requireBusinessOwner } from "@/lib/owner-auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

const itemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
});

const createReturnSchema = z.object({
  customerId: z.number().int().positive(),
  notes: z.string().trim().max(500).nullable().optional(),
  restock: z.boolean().optional().default(true),
  items: z.array(itemSchema).min(1).max(100),
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

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: productReturns.id,
        customerId: productReturns.customerId,
        totalAmount: productReturns.totalAmount,
        notes: productReturns.notes,
        createdAt: productReturns.createdAt,
        customerName: customers.name,
      })
      .from(productReturns)
      .innerJoin(customers, eq(productReturns.customerId, customers.id))
      .where(eq(productReturns.businessId, session.businessId))
      .orderBy(desc(productReturns.createdAt))
      .limit(100);

    return jsonResponse(
      {
        returns: rows.map((row) => ({
          id: row.id,
          customerId: row.customerId,
          customerName: row.customerName,
          totalAmount: asNumber(row.totalAmount),
          notes: row.notes,
          createdAt: row.createdAt,
        })),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/returns failed:", error);
    return jsonResponse({ error: "Failed to load returns" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = createReturnSchema.parse(await request.json());
    const db = getDb();
    const businessId = session.businessId;

    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, body.customerId),
          eq(customers.businessId, businessId),
        ),
      )
      .limit(1);

    if (!customer) {
      return jsonResponse({ error: "Customer not found" }, 404, origin);
    }
    if (customer.type !== "shop") {
      return jsonResponse(
        { error: "Returns are only for shop customers" },
        400,
        origin,
      );
    }

    const variantIds = body.items.map((item) => item.variantId);
    const variantRows = await db
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        label: productVariants.label,
        price: productVariants.price,
        stockQty: productVariants.stockQty,
        productName: products.name,
        businessId: products.businessId,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(productVariants.id, variantIds));

    if (variantRows.length !== new Set(variantIds).size) {
      return jsonResponse({ error: "One or more variants not found" }, 400, origin);
    }

    const variantMap = new Map(variantRows.map((row) => [row.variantId, row]));
    let totalAmount = 0;
    const lineRows: Array<{
      productId: number;
      variantId: number;
      quantity: number;
      unitPrice: number;
    }> = [];

    for (const item of body.items) {
      const variant = variantMap.get(item.variantId);
      if (!variant || variant.businessId !== businessId) {
        return jsonResponse({ error: "Invalid product variant" }, 400, origin);
      }
      if (variant.productId !== item.productId) {
        return jsonResponse({ error: "Variant does not match product" }, 400, origin);
      }
      const unitPrice = asNumber(variant.price);
      totalAmount += unitPrice * item.quantity;
      lineRows.push({
        productId: variant.productId,
        variantId: variant.variantId,
        quantity: item.quantity,
        unitPrice,
      });
    }

    const [ret] = await db
      .insert(productReturns)
      .values({
        businessId,
        customerId: customer.id,
        totalAmount: money(totalAmount),
        notes: body.notes || null,
      })
      .returning();

    await db.insert(productReturnItems).values(
      lineRows.map((item) => ({
        returnId: ret.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
      })),
    );

    await db
      .update(customers)
      .set({
        returnCredit: money(asNumber(customer.returnCredit) + totalAmount),
      })
      .where(eq(customers.id, customer.id));

    if (body.restock) {
      for (const item of body.items) {
        const variant = variantMap.get(item.variantId)!;
        await db
          .update(productVariants)
          .set({ stockQty: variant.stockQty + item.quantity })
          .where(eq(productVariants.id, item.variantId));
      }
    }

    return jsonResponse(
      {
        returnRecord: {
          id: ret.id,
          customerId: customer.id,
          customerName: customer.name,
          totalAmount,
          notes: ret.notes,
          createdAt: ret.createdAt,
        },
        message: "Return recorded. Credit applied to shop.",
      },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid return data" }, 400, origin);
    }
    console.error("POST /api/returns failed:", error);
    return jsonResponse({ error: "Failed to create return" }, 500, origin);
  }
}
