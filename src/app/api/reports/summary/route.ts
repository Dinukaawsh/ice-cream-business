import { and, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDb } from "@/db";
import {
  productReturns,
  saleItems,
  sales,
} from "@/db/schema";
import { asNumber, requireBusinessOwner } from "@/lib/owner-auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
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
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const now = new Date();
    const from =
      parseDateParam(fromParam) ??
      new Date(now.getFullYear(), now.getMonth(), 1);
    const to = parseDateParam(toParam, true) ?? now;

    if (from > to) {
      return jsonResponse({ error: "Invalid date range" }, 400, origin);
    }

    const db = getDb();
    const businessId = session.businessId;

    const [salesAgg] = await db
      .select({
        totalSales: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
        totalPaid: sql<string>`coalesce(sum(${sales.paidAmount}), 0)`,
        totalReturnsCredit: sql<string>`coalesce(sum(${sales.returnsCreditApplied}), 0)`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, businessId),
          gte(sales.saleDate, from),
          lte(sales.saleDate, to),
        ),
      );

    const [returnsAgg] = await db
      .select({
        totalReturns: sql<string>`coalesce(sum(${productReturns.totalAmount}), 0)`,
        returnCount: sql<number>`count(*)::int`,
      })
      .from(productReturns)
      .where(
        and(
          eq(productReturns.businessId, businessId),
          gte(productReturns.createdAt, from),
          lte(productReturns.createdAt, to),
        ),
      );

    const soldProducts = await db
      .select({
        productName: saleItems.productName,
        flavor: saleItems.flavor,
        variantLabel: saleItems.variantLabel,
        quantity: sql<number>`coalesce(sum(${saleItems.quantity}), 0)::int`,
        amount: sql<string>`coalesce(sum(${saleItems.unitPrice} * ${saleItems.quantity}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          eq(sales.businessId, businessId),
          gte(sales.saleDate, from),
          lte(sales.saleDate, to),
        ),
      )
      .groupBy(
        saleItems.productName,
        saleItems.flavor,
        saleItems.variantLabel,
      )
      .orderBy(
        sql`sum(${saleItems.unitPrice} * ${saleItems.quantity}) desc`,
      );

    const daily = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${sales.saleDate}), 'YYYY-MM-DD')`,
        amount: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
        orders: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.businessId, businessId),
          gte(sales.saleDate, from),
          lte(sales.saleDate, to),
        ),
      )
      .groupBy(sql`date_trunc('day', ${sales.saleDate})`)
      .orderBy(sql`date_trunc('day', ${sales.saleDate})`);

    return jsonResponse(
      {
        report: {
          from: from.toISOString(),
          to: to.toISOString(),
          totalSales: asNumber(salesAgg?.totalSales),
          totalPaid: asNumber(salesAgg?.totalPaid),
          totalReturnsCreditApplied: asNumber(salesAgg?.totalReturnsCredit),
          orderCount: salesAgg?.orderCount ?? 0,
          returnsRecorded: asNumber(returnsAgg?.totalReturns),
          returnCount: returnsAgg?.returnCount ?? 0,
          daily: daily.map((row) => ({
            day: row.day,
            amount: asNumber(row.amount),
            orders: row.orders,
          })),
          soldProducts: soldProducts.map((row) => ({
            productName: row.productName,
            flavor: row.flavor,
            variantLabel: row.variantLabel,
            quantity: row.quantity,
            amount: asNumber(row.amount),
          })),
        },
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/reports/summary failed:", error);
    return jsonResponse({ error: "Failed to load report" }, 500, origin);
  }
}
