import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getDb } from "@/db";
import { saleItems, sales } from "@/db/schema";
import { getSessionFromRequest } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sampleDashboard() {
  return {
    isSample: true,
    todaySales: 18450,
    weekSales: 96200,
    monthSales: 386400,
    ordersToday: 24,
    returnsCreditToday: 1450,
    avgTicket: 768.75,
    weekly: [
      { label: "Mon", amount: 11200 },
      { label: "Tue", amount: 9800 },
      { label: "Wed", amount: 14300 },
      { label: "Thu", amount: 12600 },
      { label: "Fri", amount: 16800 },
      { label: "Sat", amount: 19200 },
      { label: "Sun", amount: 12300 },
    ],
    topFlavors: [
      { name: "Vanilla", amount: 28600, share: 0.3 },
      { name: "Chocolate", amount: 24100, share: 0.25 },
      { name: "Strawberry", amount: 18400, share: 0.19 },
      { name: "Mango", amount: 15200, share: 0.16 },
      { name: "Other", amount: 9900, share: 0.1 },
    ],
    channelSplit: [
      { name: "Walk-in", amount: 54800 },
      { name: "Shop", amount: 41400 },
    ],
  };
}

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (
    !session ||
    session.role !== "business_owner" ||
    !session.businessId ||
    session.status === "disabled"
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const db = getDb();
    const businessId = session.businessId;
    const now = new Date();
    const today = startOfDay(now);
    const weekAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    const monthAgo = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .where(eq(sales.businessId, businessId));

    if (!countRow?.count) {
      return jsonResponse({ dashboard: sampleDashboard() }, 200, origin);
    }

    const [todayAgg] = await db
      .select({
        total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
        orders: sql<number>`count(*)::int`,
        returns: sql<string>`coalesce(sum(${sales.returnsCreditApplied}), 0)`,
      })
      .from(sales)
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, today)),
      );

    const [weekAgg] = await db
      .select({
        total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      })
      .from(sales)
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, weekAgo)),
      );

    const [monthAgg] = await db
      .select({
        total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      })
      .from(sales)
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, monthAgo)),
      );

    const dayRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${sales.saleDate}), 'YYYY-MM-DD')`,
        total: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      })
      .from(sales)
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, weekAgo)),
      )
      .groupBy(sql`date_trunc('day', ${sales.saleDate})`)
      .orderBy(sql`date_trunc('day', ${sales.saleDate})`);

    const dayMap = new Map(
      dayRows.map((row) => [row.day, Number(row.total) || 0]),
    );
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekAgo.getTime() + index * 24 * 60 * 60 * 1000);
      const key = ymd(date);
      const label = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        date.getDay()
      ];
      return { label, amount: dayMap.get(key) ?? 0 };
    });

    const flavorRows = await db
      .select({
        name: saleItems.flavor,
        amount: sql<string>`coalesce(sum(${saleItems.unitPrice} * ${saleItems.quantity}), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, monthAgo)),
      )
      .groupBy(saleItems.flavor)
      .orderBy(
        sql`sum(${saleItems.unitPrice} * ${saleItems.quantity}) desc`,
      )
      .limit(5);

    const flavorTotal = flavorRows.reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0,
    );
    const topFlavors = flavorRows.map((row) => {
      const amount = Number(row.amount) || 0;
      return {
        name: row.name,
        amount,
        share: flavorTotal > 0 ? amount / flavorTotal : 0,
      };
    });

    const channelRows = await db
      .select({
        name: sql<string>`case when ${sales.customerId} is null then 'Walk-in' else 'Shop' end`,
        amount: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
      })
      .from(sales)
      .where(
        and(eq(sales.businessId, businessId), gte(sales.saleDate, monthAgo)),
      )
      .groupBy(
        sql`case when ${sales.customerId} is null then 'Walk-in' else 'Shop' end`,
      );

    const todaySales = Number(todayAgg?.total) || 0;
    const ordersToday = todayAgg?.orders ?? 0;

    return jsonResponse(
      {
        dashboard: {
          isSample: false,
          todaySales,
          weekSales: Number(weekAgg?.total) || 0,
          monthSales: Number(monthAgg?.total) || 0,
          ordersToday,
          returnsCreditToday: Number(todayAgg?.returns) || 0,
          avgTicket: ordersToday > 0 ? todaySales / ordersToday : 0,
          weekly,
          topFlavors:
            topFlavors.length > 0
              ? topFlavors
              : sampleDashboard().topFlavors.map((item) => ({
                  ...item,
                  amount: 0,
                  share: 0,
                })),
          channelSplit: channelRows.map((row) => ({
            name: row.name,
            amount: Number(row.amount) || 0,
          })),
        },
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/dashboard/summary failed:", error);
    return jsonResponse({ error: "Failed to load dashboard" }, 500, origin);
  }
}
