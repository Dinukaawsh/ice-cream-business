function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function getJwtSecretBytes() {
  return new TextEncoder().encode(requireEnv("JWT_SECRET"));
}

export function getDatabaseUrl() {
  return requireEnv("DATABASE_URL");
}

export function getDiscordWebhookUrl() {
  return requireEnv("DISCORD_WEBHOOK_URL");
}

export function getAppUrl() {
  return requireEnv("APP_URL").replace(/\/$/, "");
}

export function getAdminSeedCredentials() {
  return {
    email: requireEnv("ADMIN_EMAIL").toLowerCase(),
    password: requireEnv("ADMIN_PASSWORD"),
  };
}

export function getResendApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || null;
}

export function getEmailFrom() {
  return process.env.EMAIL_FROM?.trim() || "Scooply <noreply@scooply.app>";
}
