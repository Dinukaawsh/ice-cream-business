import { NextRequest } from "next/server";
import { z } from "zod";

import { getSessionFromRequest } from "@/lib/auth";
import { setBusinessLogoUrl } from "@/lib/business-settings";
import { uploadBusinessLogo } from "@/lib/cloudinary";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

const uploadSchema = z.object({
  dataUri: z
    .string()
    .min(32)
    .max(900_000)
    .refine(
      (v) => /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(v),
      "Logo must be a PNG, JPEG, or WebP image",
    ),
});

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (
    !session ||
    session.role !== "business_owner" ||
    session.status !== "active" ||
    !session.businessId
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = uploadSchema.parse(await request.json());
    const uploaded = await uploadBusinessLogo(body.dataUri, session.businessId);
    const settings = await setBusinessLogoUrl(
      session.businessId,
      uploaded.url,
    );
    return jsonResponse(
      { settings, logoUrl: uploaded.url, message: "Logo uploaded" },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid logo image" }, 400, origin);
    }
    const message =
      error instanceof Error ? error.message : "Logo upload failed";
    console.error("POST /api/settings/business/logo failed:", error);
    return jsonResponse({ error: message }, 400, origin);
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (
    !session ||
    session.role !== "business_owner" ||
    session.status !== "active" ||
    !session.businessId
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const settings = await setBusinessLogoUrl(session.businessId, null);
    return jsonResponse(
      { settings, message: "Logo removed" },
      200,
      origin,
    );
  } catch (error) {
    console.error("DELETE /api/settings/business/logo failed:", error);
    return jsonResponse({ error: "Could not remove logo" }, 500, origin);
  }
}
