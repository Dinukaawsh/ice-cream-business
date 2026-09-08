import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { categories, productVariants, products } from "@/db/schema";
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

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(60),
  price: z.coerce.number().nonnegative().max(1_000_000),
  stockQty: z.coerce.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().optional().default(true),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  flavor: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(500).optional().nullable(),
  categoryId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  variants: z.array(variantSchema).min(1).max(20),
});

async function loadProductsForBusiness(businessId: number) {
  const db = getDb();
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      flavor: products.flavor,
      notes: products.notes,
      isActive: products.isActive,
      categoryId: products.categoryId,
      categoryName: categories.name,
      createdAt: products.createdAt,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.businessId, businessId))
    .orderBy(desc(products.createdAt));

  if (productRows.length === 0) return [];

  const ids = productRows.map((row) => row.id);
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids));

  const byProduct = new Map<number, typeof variantRows>();
  for (const variant of variantRows) {
    const list = byProduct.get(variant.productId) ?? [];
    list.push(variant);
    byProduct.set(variant.productId, list);
  }

  return productRows.map((row) => ({
    id: row.id,
    name: row.name,
    flavor: row.flavor,
    notes: row.notes,
    isActive: row.isActive,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    createdAt: row.createdAt,
    variants: (byProduct.get(row.id) ?? []).map((variant) => ({
      id: variant.id,
      label: variant.label,
      price: Number(variant.price),
      stockQty: variant.stockQty,
      isActive: variant.isActive,
    })),
  }));
}

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
    const list = await loadProductsForBusiness(session.businessId);
    return jsonResponse({ products: list }, 200, origin);
  } catch (error) {
    console.error("GET /api/products failed:", error);
    return jsonResponse({ error: "Failed to load products" }, 500, origin);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireOwner(request);
  if (!session?.businessId || session.status !== "active") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = productSchema.parse(await request.json());
    const db = getDb();

    if (body.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, body.categoryId),
            eq(categories.businessId, session.businessId),
          ),
        )
        .limit(1);
      if (!category) {
        return jsonResponse({ error: "Category not found" }, 400, origin);
      }
    }

    const [product] = await db
      .insert(products)
      .values({
        businessId: session.businessId,
        categoryId: body.categoryId ?? null,
        name: body.name,
        flavor: body.flavor,
        notes: body.notes || null,
        isActive: body.isActive,
      })
      .returning();

    await db.insert(productVariants).values(
      body.variants.map((variant) => ({
        productId: product.id,
        label: variant.label,
        price: variant.price.toFixed(2),
        stockQty: variant.stockQty,
        isActive: variant.isActive,
      })),
    );

    const list = await loadProductsForBusiness(session.businessId);
    const created = list.find((item) => item.id === product.id);

    return jsonResponse(
      { product: created, message: "Product created" },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid product data" }, 400, origin);
    }
    console.error("POST /api/products failed:", error);
    return jsonResponse({ error: "Failed to create product" }, 500, origin);
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await requireOwner(request);
  if (!session?.businessId || session.status !== "active") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: "Invalid product id" }, 400, origin);
  }

  try {
    const body = productSchema.parse(await request.json());
    const db = getDb();

    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.id, id), eq(products.businessId, session.businessId)),
      )
      .limit(1);

    if (!existing) {
      return jsonResponse({ error: "Product not found" }, 404, origin);
    }

    if (body.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, body.categoryId),
            eq(categories.businessId, session.businessId),
          ),
        )
        .limit(1);
      if (!category) {
        return jsonResponse({ error: "Category not found" }, 400, origin);
      }
    }

    await db
      .update(products)
      .set({
        name: body.name,
        flavor: body.flavor,
        notes: body.notes || null,
        categoryId: body.categoryId ?? null,
        isActive: body.isActive,
      })
      .where(eq(products.id, id));

    await db
      .delete(productVariants)
      .where(eq(productVariants.productId, id));

    await db.insert(productVariants).values(
      body.variants.map((variant) => ({
        productId: id,
        label: variant.label,
        price: variant.price.toFixed(2),
        stockQty: variant.stockQty,
        isActive: variant.isActive,
      })),
    );

    const list = await loadProductsForBusiness(session.businessId);
    const updated = list.find((item) => item.id === id);

    return jsonResponse(
      { product: updated, message: "Product updated" },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid product data" }, 400, origin);
    }
    console.error("PATCH /api/products failed:", error);
    return jsonResponse({ error: "Failed to update product" }, 500, origin);
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
    return jsonResponse({ error: "Invalid product id" }, 400, origin);
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(products)
      .where(
        and(eq(products.id, id), eq(products.businessId, session.businessId)),
      )
      .returning({ id: products.id });

    if (deleted.length === 0) {
      return jsonResponse({ error: "Product not found" }, 404, origin);
    }

    return jsonResponse({ ok: true, message: "Product deleted" }, 200, origin);
  } catch (error) {
    console.error("DELETE /api/products failed:", error);
    return jsonResponse({ error: "Failed to delete product" }, 500, origin);
  }
}
