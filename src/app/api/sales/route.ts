import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  customers,
  productVariants,
  products,
  saleItems,
  sales,
} from "@/db/schema";
import { asNumber, money, requireBusinessOwner } from "@/lib/owner-auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

const itemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive(),
  quantity: z.number().int().positive().max(10000),
});

const createSaleSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  walkInName: z.string().trim().max(120).nullable().optional(),
  saleDate: z.string().datetime().optional(),
  paidAmount: z.coerce.number().nonnegative().default(0),
  applyReturnCredit: z.boolean().optional().default(true),
  notes: z.string().trim().max(500).nullable().optional(),
  items: z.array(itemSchema).min(1).max(100),
});

async function loadSale(businessId: number, saleId: number) {
  const db = getDb();
  const [sale] = await db
    .select({
      id: sales.id,
      customerId: sales.customerId,
      walkInName: sales.walkInName,
      saleDate: sales.saleDate,
      totalAmount: sales.totalAmount,
      previousBalance: sales.previousBalance,
      returnsCreditApplied: sales.returnsCreditApplied,
      paidAmount: sales.paidAmount,
      remainingAfter: sales.remainingAfter,
      notes: sales.notes,
      billPrinted: sales.billPrinted,
      customerName: customers.name,
      customerType: customers.type,
      customerPhone: customers.phone,
      customerAddress: customers.address,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
    .limit(1);

  if (!sale) return null;

  const items = await db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId));

  return {
    id: sale.id,
    customerId: sale.customerId,
    walkInName: sale.walkInName,
    customerName: sale.customerName,
    customerType: sale.customerType,
    customerPhone: sale.customerPhone,
    customerAddress: sale.customerAddress,
    saleDate: sale.saleDate,
    totalAmount: asNumber(sale.totalAmount),
    previousBalance: asNumber(sale.previousBalance),
    returnsCreditApplied: asNumber(sale.returnsCreditApplied),
    paidAmount: asNumber(sale.paidAmount),
    remainingAfter: asNumber(sale.remainingAfter),
    notes: sale.notes,
    billPrinted: sale.billPrinted,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      flavor: item.flavor,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      unitPrice: asNumber(item.unitPrice),
      lineTotal: asNumber(item.unitPrice) * item.quantity,
    })),
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

  const saleId = Number(request.nextUrl.searchParams.get("id"));
  try {
    if (Number.isInteger(saleId) && saleId > 0) {
      const sale = await loadSale(session.businessId, saleId);
      if (!sale) {
        return jsonResponse({ error: "Sale not found" }, 404, origin);
      }
      return jsonResponse({ sale }, 200, origin);
    }

    const db = getDb();
    const rows = await db
      .select({
        id: sales.id,
        customerId: sales.customerId,
        walkInName: sales.walkInName,
        saleDate: sales.saleDate,
        totalAmount: sales.totalAmount,
        paidAmount: sales.paidAmount,
        remainingAfter: sales.remainingAfter,
        returnsCreditApplied: sales.returnsCreditApplied,
        customerName: customers.name,
        customerType: customers.type,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(eq(sales.businessId, session.businessId))
      .orderBy(desc(sales.saleDate))
      .limit(100);

    return jsonResponse(
      {
        sales: rows.map((row) => ({
          id: row.id,
          customerId: row.customerId,
          walkInName: row.walkInName,
          customerName: row.customerName,
          customerType: row.customerType,
          saleDate: row.saleDate,
          totalAmount: asNumber(row.totalAmount),
          paidAmount: asNumber(row.paidAmount),
          remainingAfter: asNumber(row.remainingAfter),
          returnsCreditApplied: asNumber(row.returnsCreditApplied),
        })),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/sales failed:", error);
    return jsonResponse({ error: "Failed to load sales" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireBusinessOwner(request, { requireActive: true });
  if (!session?.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = createSaleSchema.parse(await request.json());
    if (!body.customerId && !body.walkInName?.trim()) {
      return jsonResponse(
        { error: "Select a customer or enter a walk-in name" },
        400,
        origin,
      );
    }

    const db = getDb();
    const businessId = session.businessId;

    let customer: typeof customers.$inferSelect | null = null;
    if (body.customerId) {
      const [row] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, body.customerId),
            eq(customers.businessId, businessId),
          ),
        )
        .limit(1);
      if (!row) {
        return jsonResponse({ error: "Customer not found" }, 404, origin);
      }
      customer = row;
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
        flavor: products.flavor,
        businessId: products.businessId,
        productActive: products.isActive,
        variantActive: productVariants.isActive,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(productVariants.id, variantIds));

    if (variantRows.length !== new Set(variantIds).size) {
      return jsonResponse({ error: "One or more variants not found" }, 400, origin);
    }

    const variantMap = new Map(variantRows.map((row) => [row.variantId, row]));
    const lineRows: Array<{
      productId: number;
      variantId: number;
      productName: string;
      flavor: string;
      variantLabel: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    let totalAmount = 0;
    for (const item of body.items) {
      const variant = variantMap.get(item.variantId);
      if (!variant || variant.businessId !== businessId) {
        return jsonResponse({ error: "Invalid product variant" }, 400, origin);
      }
      if (variant.productId !== item.productId) {
        return jsonResponse({ error: "Variant does not match product" }, 400, origin);
      }
      if (!variant.productActive || !variant.variantActive) {
        return jsonResponse(
          { error: `${variant.productName} is inactive` },
          400,
          origin,
        );
      }
      if (variant.stockQty < item.quantity) {
        return jsonResponse(
          {
            error: `Not enough stock for ${variant.productName} (${variant.label})`,
          },
          400,
          origin,
        );
      }
      const unitPrice = asNumber(variant.price);
      totalAmount += unitPrice * item.quantity;
      lineRows.push({
        productId: variant.productId,
        variantId: variant.variantId,
        productName: variant.productName,
        flavor: variant.flavor,
        variantLabel: variant.label,
        quantity: item.quantity,
        unitPrice,
      });
    }

    const previousBalance = customer ? asNumber(customer.outstandingBalance) : 0;
    const availableCredit =
      customer && body.applyReturnCredit ? asNumber(customer.returnCredit) : 0;
    const amountBeforePay = previousBalance + totalAmount;
    const returnsCreditApplied = Math.min(availableCredit, amountBeforePay);
    const remainingAfter = Math.max(
      0,
      amountBeforePay - returnsCreditApplied - body.paidAmount,
    );

    const saleDate = body.saleDate ? new Date(body.saleDate) : new Date();

    const [sale] = await db
      .insert(sales)
      .values({
        businessId,
        customerId: customer?.id ?? null,
        walkInName: customer ? null : body.walkInName!.trim(),
        saleDate,
        totalAmount: money(totalAmount),
        previousBalance: money(previousBalance),
        returnsCreditApplied: money(returnsCreditApplied),
        paidAmount: money(body.paidAmount),
        remainingAfter: money(remainingAfter),
        notes: body.notes || null,
      })
      .returning();

    await db.insert(saleItems).values(
      lineRows.map((item) => ({
        saleId: sale.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        flavor: item.flavor,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
      })),
    );

    for (const item of body.items) {
      const variant = variantMap.get(item.variantId)!;
      await db
        .update(productVariants)
        .set({ stockQty: variant.stockQty - item.quantity })
        .where(eq(productVariants.id, item.variantId));
    }

    if (customer) {
      await db
        .update(customers)
        .set({
          outstandingBalance: money(remainingAfter),
          returnCredit: money(
            Math.max(0, asNumber(customer.returnCredit) - returnsCreditApplied),
          ),
        })
        .where(eq(customers.id, customer.id));
    }

    const full = await loadSale(businessId, sale.id);
    return jsonResponse(
      { sale: full, message: "Sale created" },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid sale data" }, 400, origin);
    }
    console.error("POST /api/sales failed:", error);
    return jsonResponse({ error: "Failed to create sale" }, 500, origin);
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
    return jsonResponse({ error: "Invalid sale id" }, 400, origin);
  }

  try {
    const body = z
      .object({ billPrinted: z.boolean() })
      .parse(await request.json());
    const db = getDb();
    const [row] = await db
      .update(sales)
      .set({ billPrinted: body.billPrinted })
      .where(and(eq(sales.id, id), eq(sales.businessId, session.businessId)))
      .returning({ id: sales.id });

    if (!row) {
      return jsonResponse({ error: "Sale not found" }, 404, origin);
    }

    return jsonResponse({ ok: true, message: "Sale updated" }, 200, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid update" }, 400, origin);
    }
    console.error("PATCH /api/sales failed:", error);
    return jsonResponse({ error: "Failed to update sale" }, 500, origin);
  }
}
