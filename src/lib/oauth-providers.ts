import { createHash } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type OAuthProfile = {
  email: string;
  name: string;
  subject: string;
};

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const facebookLimitedJwks = [
  createRemoteJWKSet(
    new URL("https://www.facebook.com/.well-known/oauth/openid/jwks/"),
  ),
  createRemoteJWKSet(
    new URL("https://limited.facebook.com/.well-known/oauth/openid/jwks/"),
  ),
];

function isJwt(token: string) {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function sha256Digest(value: string, encoding: "hex" | "base64" | "base64url") {
  return createHash("sha256").update(value).digest(encoding);
}

function friendlyConfigError(message: string) {
  if (message.includes("GOOGLE_CLIENT_ID")) {
    return "Google sign-in is not set up on the server. Add GOOGLE_CLIENT_ID (Web client ID) in .env.local and Vercel.";
  }
  if (message.includes("FACEBOOK_APP_ID") || message.includes("FACEBOOK_APP_SECRET")) {
    return "Facebook sign-in is not set up on the server. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env.local and Vercel.";
  }
  return message;
}

export async function verifyGoogleIdToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google email is missing or not verified");
  }

  return {
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || payload.email),
    subject: String(payload.sub),
  };
}

async function verifyFacebookLimitedLogin(
  idToken: string,
  nonce?: string,
): Promise<OAuthProfile> {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  if (!appId) {
    throw new Error("FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set");
  }

  let lastError: unknown;
  for (const jwks of facebookLimitedJwks) {
    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: [
          "https://www.facebook.com",
          "https://facebook.com",
          "https://limited.facebook.com",
        ],
        audience: appId,
      });

      if (nonce) {
        const tokenNonce = typeof payload.nonce === "string" ? payload.nonce : "";
        const allowed = new Set([
          nonce,
          sha256Digest(nonce, "hex"),
          sha256Digest(nonce, "base64"),
          sha256Digest(nonce, "base64url"),
        ]);
        if (tokenNonce && !allowed.has(tokenNonce)) {
          throw new Error("Invalid Facebook login nonce");
        }
      }

      const email =
        typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!email) {
        throw new Error(
          "Facebook did not share an email. Allow email access, or sign in with Google / email.",
        );
      }

      return {
        email,
        name: String(payload.name || email),
        subject: String(payload.sub),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("did not share an email") ||
          error.message.includes("nonce"))
      ) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Invalid Facebook login token");
}

async function graphJson(url: URL) {
  const response = await fetch(url);
  const json = (await response.json()) as {
    error?: { message?: string };
    data?: {
      is_valid?: boolean;
      user_id?: string;
      app_id?: string | number;
      error?: { message?: string };
    };
    id?: string;
    name?: string;
    email?: string;
  };
  return { ok: response.ok, json };
}

async function verifyFacebookClassicToken(
  accessToken: string,
): Promise<OAuthProfile> {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set");
  }

  const debugUrl = new URL("https://graph.facebook.com/debug_token");
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);
  const debug = await graphJson(debugUrl);
  const debugError =
    debug.json.error?.message || debug.json.data?.error?.message;
  if (
    !debug.ok ||
    !debug.json.data?.is_valid ||
    String(debug.json.data.app_id) !== appId
  ) {
    throw new Error(debugError || "Invalid Facebook token");
  }

  const meUrl = new URL("https://graph.facebook.com/v21.0/me");
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", accessToken);
  const me = await graphJson(meUrl);
  if (!me.ok || !me.json.id) {
    throw new Error(me.json.error?.message || "Facebook profile fetch failed");
  }
  if (!me.json.email) {
    throw new Error(
      "Facebook did not share an email. Allow email access, or sign in with Google / email.",
    );
  }

  return {
    email: me.json.email.toLowerCase(),
    name: me.json.name || me.json.email,
    subject: me.json.id,
  };
}

export async function verifyFacebookToken(
  token: string,
  nonce?: string,
): Promise<OAuthProfile> {
  if (isJwt(token)) {
    return verifyFacebookLimitedLogin(token, nonce);
  }

  try {
    return await verifyFacebookClassicToken(token);
  } catch (error) {
    if (isJwt(token)) {
      return verifyFacebookLimitedLogin(token, nonce);
    }
    throw error;
  }
}

export function toOAuthUserError(error: unknown) {
  const message = error instanceof Error ? error.message : "OAuth login failed";
  return friendlyConfigError(message);
}
