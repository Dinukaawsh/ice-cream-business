import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  categories,
  productReturnItems,
  productVariants,
  products,
  saleItems,
} from "@/db/schema";
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
    .where(
      and(eq(products.businessId, businessId), isNull(products.deletedAt)),
    )
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

async function productHasHistory(productId: number) {
  const db = getDb();
  const [sold] = await db
    .select({ id: saleItems.id })
    .from(saleItems)
    .where(eq(saleItems.productId, productId))
    .limit(1);
  if (sold) return true;
  const [returned] = await db
    .select({ id: productReturnItems.id })
    .from(productReturnItems)
    .where(eq(productReturnItems.productId, productId))
    .limit(1);
  return Boolean(returned);
}

async function referencedVariantIds(variantIds: number[]) {
  const referenced = new Set<number>();
  if (variantIds.length === 0) return referenced;
  const db = getDb();
  const sold = await db
    .select({ id: saleItems.variantId })
    .from(saleItems)
    .where(inArray(saleItems.variantId, variantIds));
  const returned = await db
    .select({ id: productReturnItems.variantId })
    .from(productReturnItems)
    .where(inArray(productReturnItems.variantId, variantIds));
  for (const row of sold) referenced.add(row.id);
  for (const row of returned) referenced.add(row.id);
  return referenced;
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

  const action = request.nextUrl.searchParams.get("action");
  if (action === "disable" || action === "enable") {
    try {
      const db = getDb();
      const [existing] = await db
        .select({
          id: products.id,
          isActive: products.isActive,
          deletedAt: products.deletedAt,
        })
        .from(products)
        .where(
          and(eq(products.id, id), eq(products.businessId, session.businessId)),
        )
        .limit(1);

      if (!existing || existing.deletedAt) {
        return jsonResponse({ error: "Product not found" }, 404, origin);
      }

      const nextActive = action === "enable";
      await db
        .update(products)
        .set({ isActive: nextActive })
        .where(eq(products.id, id));
      await db
        .update(productVariants)
        .set({ isActive: nextActive })
        .where(eq(productVariants.productId, id));

      const list = await loadProductsForBusiness(session.businessId);
      const updated = list.find((item) => item.id === id);
      return jsonResponse(
        {
          product: updated,
          message: nextActive
            ? "Product enabled for sale"
            : "Product disabled",
        },
        200,
        origin,
      );
    } catch (error) {
      console.error("PATCH /api/products status failed:", error);
      return jsonResponse({ error: "Failed to update product" }, 500, origin);
    }
  }

  try {
    const body = productSchema.parse(await request.json());
    const db = getDb();

    const [existing] = await db
      .select({ id: products.id, deletedAt: products.deletedAt })
      .from(products)
      .where(
        and(eq(products.id, id), eq(products.businessId, session.businessId)),
      )
      .limit(1);

    if (!existing || existing.deletedAt) {
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

    const existingVariants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, id));
    const existingIds = new Set(existingVariants.map((row) => row.id));

    for (const variant of body.variants) {
      if (variant.id && !existingIds.has(variant.id)) {
        return jsonResponse({ error: "Invalid variant id" }, 400, origin);
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

    const keepIds = new Set<number>();
    for (const variant of body.variants) {
      if (variant.id) {
        await db
          .update(productVariants)
          .set({
            label: variant.label,
            price: variant.price.toFixed(2),
            stockQty: variant.stockQty,
            isActive: variant.isActive,
          })
          .where(
            and(
              eq(productVariants.id, variant.id),
              eq(productVariants.productId, id),
            ),
          );
        keepIds.add(variant.id);
      } else {
        const [created] = await db
          .insert(productVariants)
          .values({
            productId: id,
            label: variant.label,
            price: variant.price.toFixed(2),
            stockQty: variant.stockQty,
            isActive: variant.isActive,
          })
          .returning({ id: productVariants.id });
        keepIds.add(created.id);
      }
    }

    const removedIds = existingVariants
      .map((row) => row.id)
      .filter((variantId) => !keepIds.has(variantId));
    const referenced = await referencedVariantIds(removedIds);
    for (const variantId of removedIds) {
      if (referenced.has(variantId)) {
        await db
          .update(productVariants)
          .set({ isActive: false })
          .where(eq(productVariants.id, variantId));
      } else {
        await db
          .delete(productVariants)
          .where(eq(productVariants.id, variantId));
      }
    }

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
    const [existing] = await db
      .select({
        id: products.id,
        isActive: products.isActive,
        deletedAt: products.deletedAt,
      })
      .from(products)
      .where(
        and(eq(products.id, id), eq(products.businessId, session.businessId)),
      )
      .limit(1);

    if (!existing || existing.deletedAt) {
      return jsonResponse({ error: "Product not found" }, 404, origin);
    }

    if (existing.isActive) {
      return jsonResponse(
        { error: "Disable this product first, then you can delete it." },
        400,
        origin,
      );
    }

    if (await productHasHistory(id)) {
      await db
        .update(products)
        .set({ isActive: false, deletedAt: new Date() })
        .where(eq(products.id, id));
      await db
        .update(productVariants)
        .set({ isActive: false })
        .where(eq(productVariants.productId, id));
      return jsonResponse(
        {
          ok: true,
          archived: true,
          message:
            "Product removed from the list. Past bills still show it as no longer available.",
        },
        200,
        origin,
      );
    }

    await db
      .delete(products)
      .where(
        and(eq(products.id, id), eq(products.businessId, session.businessId)),
      );

    return jsonResponse({ ok: true, message: "Product deleted" }, 200, origin);
  } catch (error) {
    console.error("DELETE /api/products failed:", error);
    return jsonResponse({ error: "Failed to delete product" }, 500, origin);
  }
}
