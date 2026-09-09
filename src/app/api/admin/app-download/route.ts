import { NextRequest } from "next/server";

import {
  getAppDownloadAdminSettings,
  updateAppDownloadSettings,
} from "@/lib/app-download";
import { getSessionFromRequest } from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "platform_admin") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const settings = await getAppDownloadAdminSettings();
    const shareOrigin = new URL(request.url).origin;
    return jsonResponse(
      {
        settings: {
          ...settings,
          shareUrl: `${shareOrigin}/download-app`,
        },
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("GET /api/admin/app-download failed:", error);
    return jsonResponse(
      { error: "Failed to load app download settings" },
      500,
      origin,
    );
  }
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "platform_admin") {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  try {
    const body = await request.json();
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : undefined;
    const downloadUrl =
      typeof body.downloadUrl === "string" ? body.downloadUrl.trim() : "";

    const settings = await updateAppDownloadSettings({
      username,
      password,
      downloadUrl,
    });
    const shareOrigin = new URL(request.url).origin;

    return jsonResponse(
      {
        settings: {
          ...settings,
          shareUrl: `${shareOrigin}/download-app`,
        },
      },
      200,
      origin,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update app download settings";
    console.error("PATCH /api/admin/app-download failed:", error);
    return jsonResponse({ error: message }, 400, origin);
  }
}
