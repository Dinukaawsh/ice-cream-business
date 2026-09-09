import { NextRequest } from "next/server";

import {
  createAppDownloadToken,
  getAppDownloadCookieOptions,
  verifyAppDownloadLogin,
} from "@/lib/app-download";
import { corsOptionsResponse, jsonResponse } from "@/lib/cors";

export async function OPTIONS(request: NextRequest) {
  return corsOptionsResponse(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return jsonResponse(
        { error: "Username and password are required" },
        400,
        origin,
      );
    }

    const valid = await verifyAppDownloadLogin(username, password);
    if (!valid) {
      return jsonResponse(
        { error: "Invalid username or password" },
        401,
        origin,
      );
    }

    const token = await createAppDownloadToken();
    const response = jsonResponse({ ok: true }, 200, origin);
    response.cookies.set(getAppDownloadCookieOptions(token));
    return response;
  } catch (error) {
    console.error("POST /api/app-download/login failed:", error);
    return jsonResponse({ error: "Login failed" }, 500, origin);
  }
}
