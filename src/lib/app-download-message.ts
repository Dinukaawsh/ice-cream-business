import { BRAND_NAME } from "@/lib/brand";

/** Client-safe partner message builder (no server secrets). */
export function buildAppDownloadPartnerMessage({
  shareUrl,
  username,
  password,
}: {
  shareUrl: string;
  username: string;
  password: string;
}) {
  return [
    `📱 ${BRAND_NAME} — Mobile app download`,
    "",
    "Hi! Please install our Scooply owner app using the details below:",
    "",
    `🔗 Download page: ${shareUrl}`,
    `👤 Username: ${username}`,
    `🔑 Password: ${password}`,
    "",
    "Steps:",
    "1. Open the link on your Android phone",
    "2. Enter the username and password above",
    "3. Download and install the APK",
    "",
    "Thank you!",
  ].join("\n");
}
