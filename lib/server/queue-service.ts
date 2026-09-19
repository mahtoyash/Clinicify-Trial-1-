import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { DURATION_MINUTES, uncertaintyFor } from "@/lib/domain/queue";
import type { ComplaintCategory, Role } from "@/lib/domain/types";
import { sendNotification } from "./notifications";

const buffer = 2; const arrivalBuffer = 10;
const queueId = (doctorId: string) => `H1-${new Date().toISOString().slice(0, 10)}-GM-${doctorId}`;
const eta = (minutes: number, now: number) => ({ etaLower: Timestamp.fromMillis(now + Math.max(0, minutes - uncertaintyFor(minutes)) * 60000), etaUpper: Timestamp.fromMillis(now + (minutes + uncertaintyFor(minutes)) * 60000), recommendedArrival: Timestamp.fromMillis(now + Math.max(0, minutes - uncertaintyFor(minutes) - arrivalBuffer) * 60000) });

export async function reforecastDoctorQueue(doctorId: string, actorUid: string) {
  const db = adminDb(); const now = Date.now();
  const doctorRef = db.collection("doctors").doc(doctorId);
  const doctor = (await doctorRef.get()).data(); if (!doctor) throw new Error("Doctor not found");
  const snapshot = await db.collection("visits").where("doctorId", "==", doctorId).where("status", "==", "waiting").get();
  const visits: Array<{ id: string; priorityLevel?: number; priorityInsertedAt?: { toMillis?: () => number }; sequenceNumber?: number; predictedDurationMin?: number }> = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<{ priorityLevel?: number; priorityInsertedAt?: { toMillis?: () => number }; sequenceNumber?: number; predictedDurationMin?: number }, "id">) })).sort((a, b) => (b.priorityLevel ?? 0) - (a.priorityLevel ?? 0) || (a.priorityInsertedAt?.toMillis?.() ?? 0) - (b.priorityInsertedAt?.toMillis?.() ?? 0) || (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
  let workload = doctor.status === "paused" ? 15 : 0;
  if (doctor.currentVisitId) { const current = await db.collection("visits").doc(doctor.currentVisitId).get(); const active = current.data(); if (active?.consultationStartedAt) workload += Math.max((active.predictedDurationMin ?? 8) - Math.floor((now - active.consultationStartedAt.toMillis()) / 60000), 2); }
  const batch = db.batch();
  for (const visit of visits) { batch.update(db.collection("visits").doc(visit.id), { ...eta(workload, now), etaRevisionCount: FieldValue.increment(1), lastReforecastAt: FieldValue.serverTimestamp() }); workload += (visit.predictedDurationMin ?? 8) + buffer; }
  batch.set(db.collection("queues").doc(queueId(doctorId)), { hospitalId: "H1", doctorId, departmentId: doctor.departmentId, date: new Date().toISOString().slice(0,10), currentVisitId: doctor.currentVisitId ?? null, paused: doctor.status === "paused", lastReforecastAt: FieldValue.serverTimestamp(), actorUid }, { merge: true });
  await batch.commit();
  return visits.map(v => v.id);
}

export async function createVisit(input: { patient: { name: string; age: number; mobile: string; email?: string }; doctorId: string; complaint: string; complaintCategory: ComplaintCategory; departmentId: string }, actorUid: string) {
  const db = adminDb(); const existing = await db.collection("patients").where("mobile", "==", input.patient.mobile).limit(1).get(); const patientRef = existing.docs[0]?.ref ?? db.collection("patients").doc(); const visitRef = db.collection("visits").doc();
  const token = `GM-${String(Math.floor(100 + Math.random() * 900))}`; const duration = DURATION_MINUTES[input.complaintCategory];
  const trackingKey = randomUUID();
  await db.runTransaction(async tx => { tx.set(patientRef, { ...input.patient, hospitalPatientNumber: existing.docs[0]?.data().hospitalPatientNumber ?? `P-${patientRef.id.slice(-6)}`, updatedAt: FieldValue.serverTimestamp(), ...(existing.empty ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true }); tx.set(visitRef, { patientId: patientRef.id, patientName: input.patient.name, age: input.patient.age, hospitalId: "H1", departmentId: input.departmentId, doctorId: input.doctorId, token, trackingKey, email: input.patient.email ?? null, complaintText: input.complaint, complaintCategory: input.complaintCategory, priorityLevel: 0, sequenceNumber: Date.now(), status: "waiting", predictedDurationMin: duration, registeredAt: FieldValue.serverTimestamp() }); tx.set(db.collection("queueEvents").doc(), { queueId: queueId(input.doctorId), visitId: visitRef.id, eventType: "VISIT_CREATED", actorUid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [queueId(input.doctorId)] }); });
  await reforecastDoctorQueue(input.doctorId, actorUid);
  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/track/${trackingKey}`;
  await sendNotification({ visitId: visitRef.id, recipient: input.patient.email, type: "VISIT_CREATED", subject: "Your Clinicify visit is confirmed", html: `<p>Your token is <strong>${token}</strong>. <a href="${trackingUrl}">View your live queue status</a>.</p>` });
  return { visitId: visitRef.id, token, trackingUrl };
}

export async function insertPriorityVisit(visitId: string, doctorId: string, actorUid: string, actorRole: Role) {
  if (!(["receptionist", "admin"] as Role[]).includes(actorRole)) throw new Error("Only authorised staff may insert a priority case.");
  const db = adminDb(); const visitRef = db.collection("visits").doc(visitId); const visit = await visitRef.get(); if (!visit.exists) throw new Error("Visit not found");
  await visitRef.update({ doctorId, priorityLevel: 1, priorityInsertedAt: FieldValue.serverTimestamp(), sequenceNumber: -Date.now() });
  await db.collection("queueEvents").add({ queueId: queueId(doctorId), visitId, eventType: "PRIORITY_INSERTED", actorUid, createdAt: FieldValue.serverTimestamp(), metadata: { authorized: true }, affectedQueueIds: [queueId(doctorId)] });
  await reforecastDoctorQueue(doctorId, actorUid);
}
