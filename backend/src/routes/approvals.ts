import { Router } from "express";
import { z } from "zod";
import { UAParser } from "ua-parser-js";
import { prisma } from "../lib/prisma";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { hashApprovalToken } from "../services/tokens";
import { writeAuditLog } from "../services/audit";
import { sendEmailNotification } from "../services/notifications";

export const approvalsRouter = Router();

// Validate a link before showing the approval screen (still requires login separately).
approvalsRouter.get("/:requestNumber/link", async (req, res) => {
  const { token } = req.query;
  if (typeof token !== "string") return res.status(400).json({ error: "Missing token" });

  const request = await prisma.paymentRequest.findUnique({
    where: { requestNumber: req.params.requestNumber },
  });
  if (!request) return res.status(404).json({ error: "Request not found" });

  const link = await prisma.approvalLink.findFirst({
    where: { paymentRequestId: request.id, tokenHash: hashApprovalToken(token) },
  });

  if (!link) return res.status(404).json({ error: "Invalid link" });
  if (link.expiresAt < new Date()) {
    await writeAuditLog({ req, action: "APPROVAL_LINK_EXPIRED_USE", entityId: request.id });
    return res.status(410).json({ error: "This link has expired" });
  }

  res.json({ valid: true, requestNumber: request.requestNumber });
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "HOLD"]),
  remarks: z.string().optional(),
});

approvalsRouter.post("/:requestNumber/decision", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const request = await prisma.paymentRequest.findUnique({
    where: { requestNumber: req.params.requestNumber },
    include: { approvers: true, createdBy: true },
  });
  if (!request) return res.status(404).json({ error: "Request not found" });

  const isAssignedApprover = request.approvers.some((a: { userId: string }) => a.userId === req.user!.sub);
  if (!isAssignedApprover && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "You are not an approver for this request" });
  }

  if (request.status !== "PENDING" && request.status !== "HOLD") {
    return res.status(409).json({ error: `Request already ${request.status.toLowerCase()}` });
  }

  const ua = new UAParser(req.headers["user-agent"]).getResult();

  const action = await prisma.approvalAction.create({
    data: {
      paymentRequestId: request.id,
      approverId: req.user!.sub,
      decision: parsed.data.decision,
      remarks: parsed.data.remarks,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      device: ua.device.type || "desktop",
      browser: `${ua.browser.name ?? "unknown"} ${ua.browser.version ?? ""}`.trim(),
    },
  });

  const newStatus =
    parsed.data.decision === "APPROVE" ? "APPROVED" : parsed.data.decision === "REJECT" ? "REJECTED" : "HOLD";

  await prisma.paymentRequest.update({
    where: { id: request.id },
    data: { status: newStatus },
  });

  await writeAuditLog({
    req,
    userId: req.user!.sub,
    action: `DECISION_${parsed.data.decision}`,
    entityType: "PaymentRequest",
    entityId: request.id,
    metadata: { remarks: parsed.data.remarks },
  });

  await sendEmailNotification({
    to: request.createdBy.email,
    event: newStatus as "APPROVED" | "REJECTED" | "HOLD",
    requestNumber: request.requestNumber,
    remarks: parsed.data.remarks,
  });

  res.json({ status: newStatus, actionId: action.id });
});

approvalsRouter.get("/:requestNumber/history", requireAuth, async (req, res) => {
  const request = await prisma.paymentRequest.findUnique({
    where: { requestNumber: req.params.requestNumber },
  });
  if (!request) return res.status(404).json({ error: "Not found" });

  const history = await prisma.approvalAction.findMany({
    where: { paymentRequestId: request.id },
    include: { approver: true },
    orderBy: { decidedAt: "asc" },
  });
  res.json(history);
});
