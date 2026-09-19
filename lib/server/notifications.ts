import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";

export type NotificationType =
  | "VISIT_CREATED"
  | "ETA_UPDATED"
  | "PRIORITY_REFORECAST"
  | "PRESCRIPTION_AVAILABLE"
  | "PHARMACY_READY";

export async function sendNotification(input: {
  visitId: string;
  recipient?: string;
  type: NotificationType;
  subject: string;
  html: string;
}) {
  // Strip undefined values – Firestore rejects them even when ignoreUndefinedProperties is off
  const safeData = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined)
  ) as typeof input;

  const record = adminDb().collection("notifications").doc();
  await record.set({ ...safeData, channel: "email", status: "pending", createdAt: new Date() });

  if (!input.recipient) {
    await record.update({ status: "skipped", reason: "No email address" });
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: input.recipient,
      subject: input.subject,
      html: input.html,
    });
    await record.update({
      status: result.error ? "failed" : "sent",
      providerId: result.data?.id ?? null,
      error: result.error?.message ?? null,
      sentAt: new Date(),
    });
  } catch (error) {
    await record.update({
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown delivery error",
    });
  }
}
