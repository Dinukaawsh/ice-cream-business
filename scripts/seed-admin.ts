import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

async function main() {
  const { getDb } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { getAdminSeedCredentials } = await import("../src/lib/env");
  const { hashPassword } = await import("../src/lib/auth");

  const { email, password } = getAdminSeedCredentials();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordHash = await hashPassword(password);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "platform_admin",
        status: "active",
        emailVerifiedAt: new Date(),
        authProvider: "password",
        businessId: null,
        name: existing.name || "Platform Admin",
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated platform admin: ${email}`);
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash,
    name: "Platform Admin",
    role: "platform_admin",
    status: "active",
    authProvider: "password",
    emailVerifiedAt: new Date(),
    businessId: null,
  });

  console.log(`Created platform admin: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
