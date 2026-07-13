import { Request } from "express";
import { prisma } from "../lib/prisma";

export async function writeAuditLog(params: {
  req: Request;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { req, userId, action, entityType, entityId, metadata } = params;
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      metadata: metadata as any,
    },
  });
}
