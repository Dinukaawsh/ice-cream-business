import { NextRequest, NextResponse } from "next/server";

import {
  getAppDownloadCookieName,
  getConfiguredApkDownloadUrl,
  verifyAppDownloadToken,
} from "@/lib/app-download";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const token = request.cookies.get(getAppDownloadCookieName())?.value;
    if (!token || !(await verifyAppDownloadToken(token))) {
      return jsonResponse(
        { error: "Download access expired. Sign in again." },
        401,
        origin,
      );
    }

    const downloadUrl = await getConfiguredApkDownloadUrl();
    if (!downloadUrl) {
      return jsonResponse(
        { error: "APK download is not configured" },
        503,
        origin,
      );
    }

    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error("GET /api/app-download/apk failed:", error);
    return jsonResponse({ error: "Download failed" }, 500, origin);
  }
}
