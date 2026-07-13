import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth";
import { generateApprovalToken } from "../services/tokens";
import { writeAuditLog } from "../services/audit";
import { sendEmailNotification, sendWhatsAppNotification } from "../services/notifications";

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

const attachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  dataBase64: z.string().min(1),
});

const createRequestSchema = z.object({
  supplierName: z.string().min(1),
  outletName: z.string().min(1),
  invoiceNumber: z.string().min(1),
  serviceOrGoods: z.string().min(1),
  invoiceAmount: z.number().positive(),
  paymentAmount: z.number().positive(),
  currency: z.string().default("AED"),
  reason: z.string().min(1),
  isBatch: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        supplierName: z.string(),
        invoiceNumber: z.string(),
        invoiceAmount: z.number().positive(),
        paymentAmount: z.number().positive(),
      })
    )
    .optional(),
  attachments: z.array(attachmentSchema).optional(),
});

// Fields that can be changed after submission, while still pending/on hold.
const editRequestSchema = z.object({
  supplierName: z.string().min(1).optional(),
  outletName: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1).optional(),
  serviceOrGoods: z.string().min(1).optional(),
  invoiceAmount: z.number().positive().optional(),
  paymentAmount: z.number().positive().optional(),
  currency: z.string().optional(),
  reason: z.string().min(1).optional(),
});

// Every request automatically goes to both approvers — no picking required.
const DEFAULT_APPROVER_EMAILS = ["admin@aptitude.ae", "operations@aptitude.ae"];

async function nextRequestNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.paymentRequest.count({
    where: { requestNumber: { startsWith: `PR-${year}-` } },
  });
  const seq = String(count + 1).padStart(6, "0");
  return `PR-${year}-${seq}`;
}

// Finance creates a payment request -> generates approval link(s) -> notifies approvers
requestsRouter.post("/", requireRole("FINANCE", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  // Look up the fixed approver accounts (Siji and Deven) rather than trusting
  // the client to specify who approves.
  const approverUsers = await prisma.user.findMany({
    where: { email: { in: DEFAULT_APPROVER_EMAILS } },
  });
  if (approverUsers.length === 0) {
    return res.status(500).json({
      error: "No approver accounts are set up yet. Contact your administrator.",
    });
  }

  const supplier = await prisma.supplier.upsert({
    where: { name: data.supplierName },
    update: {},
    create: { name: data.supplierName },
  });
  const outlet = await prisma.outlet.upsert({
    where: { name: data.outletName },
    update: {},
    create: { name: data.outletName },
  });

  const requestNumber = await nextRequestNumber();

  const created = await prisma.paymentRequest.create({
    data: {
      requestNumber,
      supplierId: supplier.id,
      outletId: outlet.id,
      invoiceNumber: data.invoiceNumber,
      serviceOrGoods: data.serviceOrGoods,
      invoiceAmount: data.invoiceAmount,
      paymentAmount: data.paymentAmount,
      currency: data.currency,
      reason: data.reason,
      isBatch: data.isBatch,
      createdById: req.user!.sub,
      approvers: { create: approverUsers.map((u: { id: string }) => ({ userId: u.id })) },
      lines: data.lines
        ? { create: data.lines.map((l) => ({ ...l })) }
        : undefined,
      attachments: data.attachments
        ? {
            create: data.attachments.map((a) => ({
              fileName: a.fileName,
              mimeType: a.mimeType,
              storageUrl: `data:${a.mimeType};base64,${a.dataBase64}`,
            })),
          }
        : undefined,
    },
    include: { approvers: { include: { user: true } } },
  });

  const expiryDays = Number(process.env.APPROVAL_LINK_EXPIRY_DAYS || 7);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  for (const approver of created.approvers) {
    const { raw, hash } = generateApprovalToken();
    await prisma.approvalLink.create({
      data: { paymentRequestId: created.id, tokenHash: hash, expiresAt },
    });

    const approveUrl = `${process.env.APPROVAL_LINK_BASE_URL}/${created.requestNumber}?token=${raw}`;

    await sendEmailNotification({
      to: approver.user.email,
      event: "SUBMITTED",
      requestNumber: created.requestNumber,
      approveUrl,
    });
    // sendWhatsAppNotification(...) can be called here the same way if enabled
  }

  await writeAuditLog({
    req,
    userId: req.user!.sub,
    action: "REQUEST_CREATED",
    entityType: "PaymentRequest",
    entityId: created.id,
  });

  res.status(201).json({ requestNumber: created.requestNumber, id: created.id });
});

// Amend a request — only while it's still pending or on hold, and only by
// the person who submitted it (or an admin). Once approved/rejected, the
// record needs to stay as-is for audit purposes; use the deletion workflow
// below for an approved request that turns out to be wrong.
requestsRouter.patch("/:requestNumber", requireRole("FINANCE", "ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = editRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const existing = await prisma.paymentRequest.findUnique({
    where: { requestNumber: req.params.requestNumber },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isOwner = existing.createdById === req.user!.sub;
  if (!isOwner && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Only the person who submitted this can edit it" });
  }
  if (existing.status !== "PENDING" && existing.status !== "HOLD") {
    return res.status(409).json({ error: "This request can no longer be edited" });
  }

  let supplierId = existing.supplierId;
  let outletId = existing.outletId;
  if (data.supplierName) {
    const supplier = await prisma.supplier.upsert({
      where: { name: data.supplierName },
      update: {},
      create: { name: data.supplierName },
    });
    supplierId = supplier.id;
  }
  if (data.outletName) {
    const outlet = await prisma.outlet.upsert({
      where: { name: data.outletName },
      update: {},
      create: { name: data.outletName },
    });
    outletId = outlet.id;
  }

  const updated = await prisma.paymentRequest.update({
    where: { id: existing.id },
    data: {
      supplierId,
      outletId,
      invoiceNumber: data.invoiceNumber,
      serviceOrGoods: data.serviceOrGoods,
      invoiceAmount: data.invoiceAmount,
      paymentAmount: data.paymentAmount,
      currency: data.currency,
      reason: data.reason,
    },
  });

  await writeAuditLog({
    req,
    userId: req.user!.sub,
    action: "REQUEST_EDITED",
    entityType: "PaymentRequest",
    entityId: existing.id,
  });

  res.json({ requestNumber: updated.requestNumber });
});

// Step 1 of deleting an approved payment: Finance (or admin) flags it for
// deletion. Nothing is removed yet — an approver has to confirm first.
requestsRouter.post(
  "/:requestNumber/request-deletion",
  requireRole("FINANCE", "ADMIN"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.paymentRequest.findUnique({
      where: { requestNumber: req.params.requestNumber },
      include: { approvers: { include: { user: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const isOwner = existing.createdById === req.user!.sub;
    if (!isOwner && req.user!.role !== "ADMIN") {
      return res.status(403).json({ error: "Only the person who submitted this can request deletion" });
    }
    if (existing.status !== "APPROVED") {
      return res.status(409).json({ error: "Only an approved payment can be sent for deletion approval" });
    }

    await prisma.paymentRequest.update({
      where: { id: existing.id },
      data: { deletionRequested: true },
    });

    await writeAuditLog({
      req,
      userId: req.user!.sub,
      action: "DELETION_REQUESTED",
      entityType: "PaymentRequest",
      entityId: existing.id,
    });

    for (const approver of existing.approvers) {
      await sendEmailNotification({
        to: approver.user.email,
        event: "HOLD",
        requestNumber: existing.requestNumber,
        remarks: "Deletion of this approved payment has been requested and needs your confirmation.",
      });
    }

    res.json({ deletionRequested: true });
  }
);

// Step 2: an assigned approver confirms or denies the deletion.
requestsRouter.post(
  "/:requestNumber/confirm-deletion",
  async (req: AuthedRequest, res) => {
    const decisionSchema = z.object({ decision: z.enum(["CONFIRM", "DENY"]), remarks: z.string().optional() });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await prisma.paymentRequest.findUnique({
      where: { requestNumber: req.params.requestNumber },
      include: { approvers: true, createdBy: true },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!existing.deletionRequested) {
      return res.status(409).json({ error: "No deletion request is pending for this payment" });
    }

    const isAssignedApprover = existing.approvers.some((a: { userId: string }) => a.userId === req.user!.sub);
    if (!isAssignedApprover && req.user!.role !== "ADMIN") {
      return res.status(403).json({ error: "You are not an approver for this request" });
    }

    const newStatus = parsed.data.decision === "CONFIRM" ? "CANCELLED" : "APPROVED";
    await prisma.paymentRequest.update({
      where: { id: existing.id },
      data: { status: newStatus, deletionRequested: false },
    });

    await writeAuditLog({
      req,
      userId: req.user!.sub,
      action: parsed.data.decision === "CONFIRM" ? "DELETION_CONFIRMED" : "DELETION_DENIED",
      entityType: "PaymentRequest",
      entityId: existing.id,
      metadata: { remarks: parsed.data.remarks },
    });

    await sendEmailNotification({
      to: existing.createdBy.email,
      event: newStatus === "CANCELLED" ? "REJECTED" : "APPROVED",
      requestNumber: existing.requestNumber,
      remarks: parsed.data.remarks,
    });

    res.json({ status: newStatus });
  }
);

requestsRouter.get("/meta/approvers", async (_req: AuthedRequest, res) => {
  const approvers = await prisma.user.findMany({
    where: { role: { in: ["MANAGER", "ADMIN"] }, isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(approvers);
});

requestsRouter.get("/", async (req: AuthedRequest, res) => {
  const status = req.query.status as string | undefined;
  const requests = await prisma.paymentRequest.findMany({
    where: status ? { status: status.toUpperCase() as any } : undefined,
    include: { supplier: true, outlet: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(requests);
});

requestsRouter.get("/:requestNumber", async (req: AuthedRequest, res) => {
  const request = await prisma.paymentRequest.findUnique({
    where: { requestNumber: req.params.requestNumber },
    include: {
      supplier: true,
      outlet: true,
      lines: true,
      attachments: true,
      approvalActions: { include: { approver: true }, orderBy: { decidedAt: "desc" } },
    },
  });
  if (!request) return res.status(404).json({ error: "Not found" });
  res.json(request);
});
