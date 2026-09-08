import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

/** Temporary test owner for mobile login without email verification. */
const DEFAULTS = {
  email: "owner@test.icecream.app",
  password: "TestOwner!2026",
  name: "Test Owner",
  businessName: "Sweet Scoop Test Shop",
  address: "12 Frost Lane, Colombo",
  phone: "+94 77 123 4567",
};

async function main() {
  const { getDb } = await import("../src/db");
  const { businesses, users } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/lib/auth");

  const email = (
    process.env.TEST_OWNER_EMAIL?.trim() || DEFAULTS.email
  ).toLowerCase();
  const password = process.env.TEST_OWNER_PASSWORD?.trim() || DEFAULTS.password;
  const name = process.env.TEST_OWNER_NAME?.trim() || DEFAULTS.name;
  const businessName =
    process.env.TEST_BUSINESS_NAME?.trim() || DEFAULTS.businessName;
  const address = process.env.TEST_BUSINESS_ADDRESS?.trim() || DEFAULTS.address;
  const phone = process.env.TEST_BUSINESS_PHONE?.trim() || DEFAULTS.phone;

  const db = getDb();
  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    if (existing.businessId) {
      await db
        .update(businesses)
        .set({
          name: businessName,
          ownerName: name,
          address,
          phone,
          email,
        })
        .where(eq(businesses.id, existing.businessId));
    } else {
      const [business] = await db
        .insert(businesses)
        .values({
          name: businessName,
          ownerName: name,
          address,
          phone,
          email,
        })
        .returning();
      await db
        .update(users)
        .set({ businessId: business.id })
        .where(eq(users.id, existing.id));
    }

    await db
      .update(users)
      .set({
        passwordHash,
        name,
        role: "business_owner",
        status: "active",
        emailVerifiedAt: new Date(),
        authProvider: "password",
      })
      .where(eq(users.id, existing.id));

    console.log(`Updated test owner: ${email}`);
    console.log(`Password: ${password}`);
    return;
  }

  const [business] = await db
    .insert(businesses)
    .values({
      name: businessName,
      ownerName: name,
      address,
      phone,
      email,
    })
    .returning();

  await db.insert(users).values({
    email,
    passwordHash,
    name,
    role: "business_owner",
    status: "active",
    authProvider: "password",
    emailVerifiedAt: new Date(),
    businessId: business.id,
  });

  console.log(`Created test owner: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Business: ${businessName}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
