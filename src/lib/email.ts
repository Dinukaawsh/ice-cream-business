import { createHash, randomBytes, randomInt } from "crypto";

import { getAppUrl, getEmailFrom, getResendApiKey } from "./env";

export function createVerificationToken() {
  return randomBytes(32).toString("base64url");
}

export function createPasswordResetOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send email: ${text}`);
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${getAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendResendEmail({
    to: email,
    subject: "Verify your Ice Cream App email",
    html: `<p>Welcome!</p><p><a href="${verifyUrl}">Verify your email</a> to activate your account.</p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetOtpEmail(email: string, otp: string) {
  await sendResendEmail({
    to: email,
    subject: "Your Ice Cream App password reset code",
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>`,
  });
}
