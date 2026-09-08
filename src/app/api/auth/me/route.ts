import { NextRequest } from "next/server";

import {
  clearTokenCookie,
  getSessionFromRequest,
} from "@/lib/auth";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const session = await getSessionFromRequest(request);
  if (!session) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  return jsonResponse({ user: session }, 200, origin);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  await clearTokenCookie();
  return jsonResponse({ ok: true }, 200, origin);
}
