import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

// Runs once at server startup. If the database has no users yet (first
// deploy), it creates starter accounts so there's a way to log in without
// needing terminal/shell access to the hosting platform. Safe to run on
// every boot — it's a no-op once users already exist.
export async function autoSeedIfEmpty() {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const password = await bcrypt.hash("Password123!", 10);

  await prisma.user.createMany({
    data: [
      { name: "Admin User", email: "admin@aptitude.com", passwordHash: password, role: "ADMIN" },
      { name: "Finance User", email: "finance@aptitude.com", passwordHash: password, role: "FINANCE" },
      { name: "Manager User", email: "manager@aptitude.com", passwordHash: password, role: "MANAGER" },
    ],
  });

  await prisma.outlet.upsert({
    where: { name: "Downtown Outlet" },
    update: {},
    create: { name: "Downtown Outlet" },
  });

  await prisma.supplier.upsert({
    where: { name: "Al Fahim Trading LLC" },
    update: {},
    create: { name: "Al Fahim Trading LLC" },
  });

  console.log("First boot: seeded starter users (password: Password123!)");
  console.log("  admin@aptitude.com / finance@aptitude.com / manager@aptitude.com");
  console.log("IMPORTANT: change these passwords once you can log in as admin.");
}
