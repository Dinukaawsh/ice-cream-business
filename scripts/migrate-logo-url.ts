import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url text`;
  await sql`ALTER TABLE businesses DROP COLUMN IF EXISTS logo_data_url`;
  console.log("Business logo_url column ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
