// Run this ONCE on the live server to add real team accounts.
// In Railway: click the backend service -> Console tab -> run:
//   node scripts/seed-team.cjs
//
// Safe to run more than once — it updates the same accounts rather than
// duplicating them.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function upsertUser(email, name, role, plainPassword) {
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true },
    create: { name, email, passwordHash, role },
  });
  console.log(`OK: ${email} (${role})`);
}

async function main() {
  await upsertUser("accounts@aptitude.ae", "Mansoor Akhter", "FINANCE", "Finance#Apt2026");
  await upsertUser("admin@aptitude.ae", "Siji", "ADMIN", "Admin#Apt2026");
  await upsertUser("operations@aptitude.ae", "Deven", "MANAGER", "Ops#Apt2026");
  console.log("Done. These three accounts are ready to log in with.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
