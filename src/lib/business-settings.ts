import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { businesses } from "@/db/schema";

export type BusinessSettingsDto = {
  businessName: string;
  ownerName: string | null;
  address: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
};

export function toBusinessSettingsDto(row: {
  name: string;
  ownerName: string | null;
  address: string;
  phone: string;
  email: string | null;
  logoUrl: string | null;
}): BusinessSettingsDto {
  return {
    businessName: row.name,
    ownerName: row.ownerName,
    address: row.address ?? "",
    phone: row.phone ?? "",
    email: row.email,
    logoUrl: row.logoUrl,
  };
}

export async function getBusinessSettingsForId(businessId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!row) return null;
  return toBusinessSettingsDto(row);
}

const updateSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z
    .union([z.string().trim().min(1).max(120), z.literal(""), z.null()])
    .optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z
    .union([z.string().trim().email().max(255), z.literal(""), z.null()])
    .optional(),
  logoUrl: z
    .union([
      z.string().url().max(2000),
      z.literal(""),
      z.null(),
    ])
    .optional(),
});

export async function updateBusinessSettingsForId(
  businessId: number,
  raw: unknown,
) {
  const body = updateSchema.parse(raw);
  const db = getDb();

  const patch: Partial<typeof businesses.$inferInsert> = {
    name: body.businessName,
  };

  if (body.ownerName !== undefined) {
    patch.ownerName =
      body.ownerName === "" || body.ownerName === null ? null : body.ownerName;
  }
  if (body.address !== undefined) patch.address = body.address;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.email !== undefined) {
    patch.email =
      body.email === "" || body.email === null ? null : body.email;
  }
  if (body.logoUrl !== undefined) {
    patch.logoUrl =
      body.logoUrl === "" || body.logoUrl === null ? null : body.logoUrl;
  }

  const [row] = await db
    .update(businesses)
    .set(patch)
    .where(eq(businesses.id, businessId))
    .returning();

  if (!row) {
    throw new Error("Business not found");
  }
  return toBusinessSettingsDto(row);
}

export async function setBusinessLogoUrl(
  businessId: number,
  logoUrl: string | null,
) {
  const db = getDb();
  const [row] = await db
    .update(businesses)
    .set({ logoUrl })
    .where(eq(businesses.id, businessId))
    .returning();
  if (!row) throw new Error("Business not found");
  return toBusinessSettingsDto(row);
}
