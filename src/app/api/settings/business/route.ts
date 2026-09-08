import { NextRequest } from "next/server";
import { z } from "zod";

import { getSessionFromRequest } from "@/lib/auth";
import {
  getBusinessSettingsForId,
  updateBusinessSettingsForId,
} from "@/lib/business-settings";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "business_owner" || !session.businessId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const settings = await getBusinessSettingsForId(session.businessId);
    if (!settings) {
      return jsonResponse({ error: "Business not found" }, 404, origin);
    }
    return jsonResponse({ settings }, 200, origin);
  } catch (error) {
    console.error("GET /api/settings/business failed:", error);
    return jsonResponse({ error: "Failed to load business settings" }, 500, origin);
  }
}

export async function PATCH(request: NextRequest) {
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
    const body = await request.json();
    const settings = await updateBusinessSettingsForId(session.businessId, body);
    return jsonResponse({ settings }, 200, origin);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Invalid business settings" }, 400, origin);
    }
    const message =
      error instanceof Error ? error.message : "Failed to update business settings";
    console.error("PATCH /api/settings/business failed:", error);
    return jsonResponse({ error: message }, 400, origin);
  }
}
