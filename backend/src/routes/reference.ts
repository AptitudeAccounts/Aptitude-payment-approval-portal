import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get("/suppliers", async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(suppliers);
});

referenceRouter.post("/suppliers", requireRole("FINANCE", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Supplier name is required" });
  const supplier = await prisma.supplier.upsert({
    where: { name: parsed.data.name },
    update: {},
    create: { name: parsed.data.name },
  });
  res.status(201).json(supplier);
});

referenceRouter.get("/outlets", async (_req, res) => {
  const outlets = await prisma.outlet.findMany({ orderBy: { name: "asc" } });
  res.json(outlets);
});

referenceRouter.post("/outlets", requireRole("FINANCE", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Outlet name is required" });
  const outlet = await prisma.outlet.upsert({
    where: { name: parsed.data.name },
    update: {},
    create: { name: parsed.data.name },
  });
  res.status(201).json(outlet);
});

// Users who are allowed to approve requests (shown as the "assign approver" list)
referenceRouter.get("/approvers", async (_req, res) => {
  const approvers = await prisma.user.findMany({
    where: { role: { in: ["MANAGER", "ADMIN"] }, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(approvers);
});
