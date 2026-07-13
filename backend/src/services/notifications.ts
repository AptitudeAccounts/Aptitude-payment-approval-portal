import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

type NotifyEvent = "SUBMITTED" | "APPROVED" | "REJECTED" | "HOLD";

const subjects: Record<NotifyEvent, (reqNo: string) => string> = {
  SUBMITTED: (r) => `Approval needed: ${r}`,
  APPROVED: (r) => `${r} has been approved`,
  REJECTED: (r) => `${r} has been rejected`,
  HOLD: (r) => `${r} has been placed on hold`,
};

export async function sendEmailNotification(params: {
  to: string;
  event: NotifyEvent;
  requestNumber: string;
  approveUrl?: string;
  remarks?: string;
}) {
  const { to, event, requestNumber, approveUrl, remarks } = params;
  const subject = subjects[event](requestNumber);

  const bodyLines = [
    `Request ${requestNumber} — status: ${event}.`,
    approveUrl ? `Review it here: ${approveUrl}` : undefined,
    remarks ? `Remarks: ${remarks}` : undefined,
  ].filter(Boolean);

  let status = "SENT";
  let providerId: string | undefined;
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text: bodyLines.join("\n\n"),
    });
    providerId = info.messageId;
  } catch (err) {
    status = "FAILED";
  }

  await prisma.notificationLog.create({
    data: { channel: "EMAIL", toAddress: to, event, status, providerId },
  });
}

// Same interface, additive channel — enable by setting WHATSAPP_ENABLED=true
export async function sendWhatsAppNotification(params: {
  toPhone: string;
  event: NotifyEvent;
  requestNumber: string;
  approveUrl: string;
}) {
  if (process.env.WHATSAPP_ENABLED !== "true") return;

  const { toPhone, event, requestNumber, approveUrl } = params;
  let status = "SENT";
  let providerId: string | undefined;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toPhone,
          type: "text",
          text: { body: `${event}: ${requestNumber}\n${approveUrl}` },
        }),
      }
    );
    const json = (await res.json()) as any;
    providerId = json?.messages?.[0]?.id;
    if (!res.ok) status = "FAILED";
  } catch {
    status = "FAILED";
  }

  await prisma.notificationLog.create({
    data: { channel: "WHATSAPP", toAddress: toPhone, event, status, providerId },
  });
}
