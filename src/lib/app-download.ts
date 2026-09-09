import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/brand";

export type AppDownloadAdminSettings = {
  username: string | null;
  hasPassword: boolean;
  downloadUrl: string | null;
  enabled: boolean;
};

export type AppDownloadPublicInfo = {
  brandName: string;
  enabled: boolean;
};

const APP_DOWNLOAD_COOKIE = "scooply_app_download";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

function extractGoogleDriveFileId(url: string) {
  const trimmed = url.trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function resolveApkDownloadUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fileId = extractGoogleDriveFileId(trimmed);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

async function ensureSettingsRow() {
  const db = getDb();
  const [existing] = await db
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  if (!existing) {
    await db.insert(platformSettings).values({ id: 1 });
  }
}

async function getSettingsRow() {
  const db = getDb();
  await ensureSettingsRow();
  const [row] = await db
    .select({
      appDownloadUsername: platformSettings.appDownloadUsername,
      appDownloadPasswordHash: platformSettings.appDownloadPasswordHash,
      appDownloadUrl: platformSettings.appDownloadUrl,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  return row ?? null;
}

export function isAppDownloadConfigured(row: {
  appDownloadUsername: string | null;
  appDownloadPasswordHash: string | null;
  appDownloadUrl: string | null;
}) {
  return Boolean(
    row.appDownloadUsername?.trim() &&
      row.appDownloadPasswordHash &&
      row.appDownloadUrl?.trim() &&
      resolveApkDownloadUrl(row.appDownloadUrl),
  );
}

export async function getAppDownloadPublicInfo(): Promise<AppDownloadPublicInfo> {
  const row = await getSettingsRow();
  if (!row) {
    return { brandName: BRAND_NAME, enabled: false };
  }
  return {
    brandName: BRAND_NAME,
    enabled: isAppDownloadConfigured(row),
  };
}

export async function getAppDownloadAdminSettings(): Promise<AppDownloadAdminSettings> {
  const row = await getSettingsRow();
  if (!row) {
    return {
      username: null,
      hasPassword: false,
      downloadUrl: null,
      enabled: false,
    };
  }

  return {
    username: row.appDownloadUsername,
    hasPassword: Boolean(row.appDownloadPasswordHash),
    downloadUrl: row.appDownloadUrl,
    enabled: isAppDownloadConfigured(row),
  };
}

export async function updateAppDownloadSettings(input: {
  username: string;
  password?: string;
  downloadUrl: string;
}): Promise<AppDownloadAdminSettings> {
  const username = input.username.trim();
  const downloadUrl = input.downloadUrl.trim();

  if (!username) {
    throw new Error("Download username is required");
  }
  if (!downloadUrl) {
    throw new Error("APK link is required");
  }
  if (!resolveApkDownloadUrl(downloadUrl)) {
    throw new Error(
      "Enter a valid Google Drive share link or direct APK download URL",
    );
  }

  const row = await getSettingsRow();
  const updates: {
    appDownloadUsername: string;
    appDownloadUrl: string;
    appDownloadPasswordHash?: string;
    updatedAt: Date;
  } = {
    appDownloadUsername: username,
    appDownloadUrl: downloadUrl,
    updatedAt: new Date(),
  };

  if (input.password?.trim()) {
    updates.appDownloadPasswordHash = await hashPassword(input.password.trim());
  } else if (!row?.appDownloadPasswordHash) {
    throw new Error("Password is required when setting up download access");
  }

  const db = getDb();
  await db
    .update(platformSettings)
    .set(updates)
    .where(eq(platformSettings.id, 1));

  return getAppDownloadAdminSettings();
}

export async function verifyAppDownloadLogin(username: string, password: string) {
  const row = await getSettingsRow();
  if (!row || !isAppDownloadConfigured(row)) return false;
  if (row.appDownloadUsername?.trim() !== username.trim()) return false;
  if (!row.appDownloadPasswordHash) return false;
  return verifyPassword(password, row.appDownloadPasswordHash);
}

export async function createAppDownloadToken() {
  return new SignJWT({ type: "app_download" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getJwtSecret());
}

export async function verifyAppDownloadToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload.type === "app_download";
  } catch {
    return false;
  }
}

export async function getConfiguredApkDownloadUrl() {
  const row = await getSettingsRow();
  if (!row?.appDownloadUrl) return null;
  return resolveApkDownloadUrl(row.appDownloadUrl);
}

export function getAppDownloadCookieName() {
  return APP_DOWNLOAD_COOKIE;
}

export function getAppDownloadCookieOptions(token: string) {
  return {
    name: APP_DOWNLOAD_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  };
}
