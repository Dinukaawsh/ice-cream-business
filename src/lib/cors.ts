import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8080",
  "http://10.0.2.2:3000",
]);

function resolveOrigin(requestOrigin: string | null) {
  if (!requestOrigin) return null;
  if (ALLOWED_ORIGINS.has(requestOrigin)) return requestOrigin;
  if (process.env.APP_URL && requestOrigin === process.env.APP_URL.replace(/\/$/, "")) {
    return requestOrigin;
  }
  return null;
}

export function corsHeaders(requestOrigin: string | null = null) {
  const origin = resolveOrigin(requestOrigin) ?? "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function corsOptionsResponse(requestOrigin: string | null = null) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(requestOrigin),
  });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  requestOrigin: string | null = null,
) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(requestOrigin),
  });
}
