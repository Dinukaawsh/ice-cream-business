import { getDiscordWebhookUrl } from "./env";

export async function notifyDiscordNewOwner(input: {
  businessName: string;
  email: string;
  authMethod: "email" | "google" | "facebook";
}) {
  try {
    const webhookUrl = getDiscordWebhookUrl();
    const content = [
      "**New ice cream owner registered**",
      `Business: ${input.businessName}`,
      `Email: ${input.email}`,
      `Method: ${input.authMethod}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n");

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    console.error("Discord notify failed:", error);
  }
}
