import { NextRequest } from "next/server";

import { getAppDownloadPublicInfo } from "@/lib/app-download";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const info = await getAppDownloadPublicInfo();
    return jsonResponse({ info }, 200, origin);
  } catch (error) {
    console.error("GET /api/app-download/info failed:", error);
    return jsonResponse({ error: "Failed to load download info" }, 500, origin);
  }
}
