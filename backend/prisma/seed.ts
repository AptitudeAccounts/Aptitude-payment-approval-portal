// Run with: npx ts-node prisma/seed.ts
// Creates one admin, one finance user, one manager (approver), plus a sample
// outlet and supplier, so you can log in and create a request immediately.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@aptitude.com" },
    update: {},
    create: { name: "Admin User", email: "admin@aptitude.com", passwordHash: password, role: "ADMIN" },
  });

  const finance = await prisma.user.upsert({
    where: { email: "finance@aptitude.com" },
    update: {},
    create: { name: "Finance User", email: "finance@aptitude.com", passwordHash: password, role: "FINANCE" },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@aptitude.com" },
    update: {},
    create: { name: "Manager User", email: "manager@aptitude.com", passwordHash: password, role: "MANAGER" },
  });

  const outlet = await prisma.outlet.upsert({
    where: { name: "Downtown Outlet" },
    update: {},
    create: { name: "Downtown Outlet" },
  });

  const supplier = await prisma.supplier.upsert({
    where: { name: "Al Fahim Trading LLC" },
    update: {},
    create: { name: "Al Fahim Trading LLC" },
  });

  console.log("Seeded users (all use password: Password123!):");
  console.log(`  admin@aptitude.com   (ADMIN)`);
  console.log(`  finance@aptitude.com (FINANCE)`);
  console.log(`  manager@aptitude.com (MANAGER)`);
  console.log(`Outlet: ${outlet.name}, Supplier: ${supplier.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
