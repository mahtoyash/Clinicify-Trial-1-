import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { reforecastDoctorQueue } from "@/lib/server/queue-service";
import type { Role } from "@/lib/domain/types";
import { sendNotification } from "@/lib/server/notifications";

const db = () => adminDb();
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
const canManageQueue = (role: Role) => role === "doctor" || role === "receptionist" || role === "admin";

export async function startConsultation(visitId: string, doctorId: string, actor: { uid: string; role: Role; doctorId?: string }) {
  assert(actor.role === "admin" || (actor.role === "doctor" && actor.doctorId === doctorId), "Only the assigned doctor may start this consultation.");
  const visitRef = db().collection("visits").doc(visitId); const visit = await visitRef.get();
  assert(visit.exists && visit.data()?.doctorId === doctorId && visit.data()?.status === "waiting", "Visit is not available to start.");
  const midpoint = ((visit.data()?.etaLower?.toMillis?.() ?? Date.now()) + (visit.data()?.etaUpper?.toMillis?.() ?? Date.now())) / 2;
  await db().runTransaction(async tx => { tx.update(visitRef, { status: "in_consultation", consultationStartedAt: FieldValue.serverTimestamp(), predictedStartAt: new Date(midpoint) }); tx.set(db().collection("doctors").doc(doctorId), { status: "busy", currentVisitId: visitId }, { merge: true }); tx.set(db().collection("queueEvents").doc(), { visitId, eventType: "CONSULTATION_STARTED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [doctorId] }); });
  await reforecastDoctorQueue(doctorId, actor.uid);
}

export async function completeConsultation(visitId: string, doctorId: string, actor: { uid: string; role: Role; doctorId?: string }) {
  assert(actor.role === "admin" || (actor.role === "doctor" && actor.doctorId === doctorId), "Only the assigned doctor may complete this consultation.");
  const visitRef = db().collection("visits").doc(visitId); const visit = await visitRef.get(); const data = visit.data();
  assert(visit.exists && data?.doctorId === doctorId && data?.status === "in_consultation", "Visit is not currently in consultation.");
  const started = data?.consultationStartedAt?.toMillis?.() ?? Date.now(); const actualDurationMin = Math.max(1, Math.round((Date.now() - started) / 60000)); const predictionErrorMin = Math.round((Date.now() - (data?.predictedStartAt?.toMillis?.() ?? Date.now())) / 60000);
  await db().runTransaction(async tx => { tx.update(visitRef, { status: "completed", consultationEndedAt: FieldValue.serverTimestamp(), actualDurationMin, predictionErrorMin }); tx.set(db().collection("doctors").doc(doctorId), { status: "available", currentVisitId: null }, { merge: true }); tx.set(db().collection("queueEvents").doc(), { visitId, eventType: "CONSULTATION_ENDED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), metadata: { actualDurationMin, predictionErrorMin }, affectedQueueIds: [doctorId] }); });
  await reforecastDoctorQueue(doctorId, actor.uid);
}

export async function transferVisit(visitId: string, destinationDoctorId: string, actor: { uid: string; role: Role; doctorId?: string }) {
  assert(canManageQueue(actor.role), "You cannot transfer visits."); const visitRef = db().collection("visits").doc(visitId); const snapshot = await visitRef.get(); const sourceDoctorId = snapshot.data()?.doctorId;
  assert(snapshot.exists && sourceDoctorId && snapshot.data()?.status === "waiting", "Only waiting visits can be transferred."); assert(actor.role !== "doctor" || actor.doctorId === sourceDoctorId, "Doctors may transfer only their own waiting visits."); assert(sourceDoctorId !== destinationDoctorId, "Visit already belongs to this doctor.");
  await db().runTransaction(async tx => { tx.update(visitRef, { doctorId: destinationDoctorId, sequenceNumber: Date.now(), priorityLevel: 0, priorityInsertedAt: null }); tx.set(db().collection("queueEvents").doc(), { visitId, eventType: "PATIENT_TRANSFERRED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [sourceDoctorId, destinationDoctorId] }); });
  await Promise.all([reforecastDoctorQueue(sourceDoctorId, actor.uid), reforecastDoctorQueue(destinationDoctorId, actor.uid)]);
}
export async function referVisit(visitId: string, destinationDoctorId: string, actor: { uid: string; role: Role; doctorId?: string }) {
  const visit = await db().collection("visits").doc(visitId).get(); assert(visit.exists, "Visit not found."); assert(actor.role === "admin" || (actor.role === "doctor" && actor.doctorId === visit.data()?.doctorId), "Only the assigned doctor may refer this visit."); await transferVisit(visitId, destinationDoctorId, actor); await db().collection("queueEvents").add({ visitId, eventType:"PATIENT_REFERRED", actorUid:actor.uid, createdAt:FieldValue.serverTimestamp(), affectedQueueIds:[visit.data()?.doctorId,destinationDoctorId] }); }

export async function markNoShow(visitId: string, actor: { uid: string; role: Role }) {
  assert(canManageQueue(actor.role), "You cannot mark a no-show."); const ref = db().collection("visits").doc(visitId); const snapshot = await ref.get(); const doctorId = snapshot.data()?.doctorId;
  assert(snapshot.exists && doctorId && snapshot.data()?.status === "waiting", "Only waiting visits may be marked no-show."); await ref.update({ status: "no_show", noShowAt: FieldValue.serverTimestamp() }); await db().collection("queueEvents").add({ visitId, eventType: "PATIENT_NO_SHOW", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [doctorId] }); await reforecastDoctorQueue(doctorId, actor.uid);
}

export async function setDoctorPause(doctorId: string, paused: boolean, actor: { uid: string; role: Role; doctorId?: string }) {
  assert(actor.role === "admin" || (actor.role === "doctor" && actor.doctorId === doctorId), "Only the assigned doctor may change this queue."); await db().collection("doctors").doc(doctorId).update({ status: paused ? "paused" : "available" }); await db().collection("queueEvents").add({ eventType: paused ? "DOCTOR_PAUSED" : "DOCTOR_RESUMED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [doctorId] }); await reforecastDoctorQueue(doctorId, actor.uid);
}

export async function savePrescription(input: { visitId: string; doctorId: string; items: Array<{ medicineId: string; name: string; dosage: string; frequency: string; timing: string; duration: string; quantity: number; notes?: string }>; notes?: string }, actor: { uid: string; role: Role; doctorId?: string }) {
  assert(actor.role === "admin" || (actor.role === "doctor" && actor.doctorId === input.doctorId), "Only the assigned doctor may prescribe."); assert(input.items.length > 0, "Add at least one medicine.");
  input.items.forEach(item => assert(typeof item.medicineId === "string" && typeof item.dosage === "string" && item.dosage.trim() && typeof item.frequency === "string" && item.frequency.trim() && typeof item.timing === "string" && item.timing.trim() && typeof item.duration === "string" && item.duration.trim() && Number.isInteger(item.quantity) && item.quantity > 0, "Every medicine needs dosage, frequency, timing, duration, and a positive quantity."));
  const visit = await db().collection("visits").doc(input.visitId).get(); assert(visit.exists && visit.data()?.doctorId === input.doctorId, "Visit does not belong to this doctor."); const prescriptionRef = db().collection("prescriptions").doc(); const orderRef = db().collection("pharmacyOrders").doc();
  const medicines = await Promise.all(input.items.map(item => db().collection("medicines").doc(item.medicineId).get())); assert(medicines.every(medicine => medicine.exists && medicine.data()?.active !== false), "One or more selected medicines are unavailable."); const pricedItems = input.items.map((item,index) => ({ ...item, unitPrice: medicines[index]?.data()?.unitPrice ?? 0, stockStatus: medicines[index]?.data()?.stockStatus ?? "unknown" })); const total = pricedItems.reduce((sum,item)=>sum + item.quantity * item.unitPrice,0);
  await db().runTransaction(async tx => { tx.set(prescriptionRef, { ...input, items: pricedItems, patientId: visit.data()!.patientId, createdAt: FieldValue.serverTimestamp(), status: "saved" }); tx.set(orderRef, { prescriptionId: prescriptionRef.id, visitId: input.visitId, patientId: visit.data()!.patientId, token: visit.data()!.token, doctorId: input.doctorId, items: pricedItems, status: "received", receivedAt: FieldValue.serverTimestamp(), billingStatus: "pending", total }); tx.set(db().collection("queueEvents").doc(), { visitId: input.visitId, eventType: "PRESCRIPTION_SAVED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), affectedQueueIds: [] }); });
  await sendNotification({ visitId: input.visitId, recipient: visit.data()?.email, type: "PRESCRIPTION_AVAILABLE", subject: "Your Clinicify prescription is available", html: "<p>Your prescription is ready for pharmacy fulfillment. View your secure tracking link for details.</p>" }); return { prescriptionId: prescriptionRef.id, orderId: orderRef.id };
}

const pharmacyStates = ["received", "preparing", "ready", "dispensed"];
export async function updatePharmacyStatus(orderId: string, status: string, actor: { uid: string; role: Role }) {
  assert(["pharmacist", "admin"].includes(actor.role), "Only pharmacy staff may update fulfillment."); assert(pharmacyStates.includes(status), "Invalid pharmacy status."); const ref = db().collection("pharmacyOrders").doc(orderId); const order = await ref.get(); assert(order.exists, "Pharmacy order not found."); const timestamps: Record<string, unknown> = { status, updatedAt: FieldValue.serverTimestamp() }; if (status === "ready") timestamps.readyAt = FieldValue.serverTimestamp(); if (status === "dispensed") timestamps.dispensedAt = FieldValue.serverTimestamp(); await ref.update(timestamps);
  if (status === "ready") { const visit = await db().collection("visits").doc(order.data()!.visitId).get(); await sendNotification({ visitId: order.data()!.visitId, recipient: visit.data()?.email, type: "PHARMACY_READY", subject: "Your Clinicify pharmacy order is ready", html: "<p>Your pharmacy order is ready for collection.</p>" }); }
}

export async function adjustInventory(medicineId: string, delta: number, actor: { uid: string; role: Role }) { assert(["pharmacist", "admin"].includes(actor.role), "Only pharmacy staff may adjust inventory."); const ref = db().collection("medicines").doc(medicineId); await db().runTransaction(async tx => { const current = await tx.get(ref); assert(current.exists, "Medicine not found."); const data = current.data()!; const stockQuantity = Math.max(0, (data.stockQuantity ?? 0) + delta); const stockStatus = stockQuantity === 0 ? "out_of_stock" : stockQuantity <= data.lowStockThreshold ? "low_stock" : "available"; tx.update(ref, { stockQuantity, stockStatus, updatedAt: FieldValue.serverTimestamp() }); tx.set(db().collection("queueEvents").doc(), { eventType: "INVENTORY_ADJUSTED", actorUid: actor.uid, createdAt: FieldValue.serverTimestamp(), metadata: { medicineId, delta, stockQuantity }, affectedQueueIds: [] }); }); }

export async function recordBilling(orderId: string, billingStatus: "paid" | "pending" | "free", actor: { uid: string; role: Role }) { assert(["pharmacist", "admin"].includes(actor.role), "Only pharmacy staff may record billing."); const ref = db().collection("pharmacyOrders").doc(orderId); const order = await ref.get(); assert(order.exists, "Pharmacy order not found."); const items = order.data()?.items ?? []; const total = billingStatus === "free" ? 0 : items.reduce((sum: number, item: { quantity?: number; unitPrice?: number }) => sum + (item.quantity ?? 0) * (item.unitPrice ?? 0), 0); await ref.update({ billingStatus, total, billedAt: FieldValue.serverTimestamp(), billedBy: actor.uid }); }
