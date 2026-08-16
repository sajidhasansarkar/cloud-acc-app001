/**
 * Seeds the four initial countries and one Organization + ADMIN user so you
 * can log in immediately after your first migration.
 *
 * Run with: npm run db:seed
 * Configure SEED_* values in your .env file first.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COUNTRIES = [
  { countryCode: "CA", countryName: "Canada", currencyCode: "CAD", currencySymbol: "$" },
  { countryCode: "US", countryName: "United States", currencyCode: "USD", currencySymbol: "$" },
  { countryCode: "GB", countryName: "United Kingdom", currencyCode: "GBP", currencySymbol: "£" },
  { countryCode: "AU", countryName: "Australia", currencyCode: "AUD", currencySymbol: "$" },
];

async function main() {
  console.log("Seeding country configurations...");
  for (const country of COUNTRIES) {
    await prisma.countryConfiguration.upsert({
      where: { countryCode: country.countryCode },
      update: {
        countryName: country.countryName,
        currencyCode: country.currencyCode,
        currencySymbol: country.currencySymbol,
      },
      create: country,
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin User";
  const orgName = process.env.SEED_ORG_NAME ?? "Demo Organization";

  console.log(`Seeding organization "${orgName}"...`);
  const org = await prisma.organization.upsert({
    where: { id: "seed-default-org" },
    update: { name: orgName },
    create: { id: "seed-default-org", name: orgName },
  });

  console.log(`Seeding admin user "${adminEmail}"...`);
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, passwordHash, role: "ADMIN" },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: {
      userId: user.id,
      organizationId: org.id,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Seed complete.");
  console.log(`  Login with: ${adminEmail} / ${adminPassword}`);
  console.log("  IMPORTANT: change this password after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
