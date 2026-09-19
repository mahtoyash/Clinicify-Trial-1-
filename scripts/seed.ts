import { config } from "dotenv";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../lib/firebase/admin";
import { reforecastDoctorQueue } from "../lib/server/queue-service";
import type { Role } from "../lib/domain/types";

config({ path: ".env.local" });

const DEMO_USERS: Array<{ email: string; password: string; role: Role; displayName: string; doctorId?: string }> = [
  { email: "reception@clinicify.test", password: "R12345678", role: "receptionist", displayName: "Riya Menon" },
  { email: "doctor@clinicify.test", password: "D12345678", role: "doctor", displayName: "Dr. Ananya Mehta", doctorId: "d-mehta" },
  { email: "pharmacy@clinicify.test", password: "P12345678", role: "pharmacist", displayName: "Aman Singh" },
  { email: "admin@clinicify.test", password: "A12345678", role: "admin", displayName: "Arjun Rao" },
];

async function ensureUser(user: (typeof DEMO_USERS)[number]) {
  let record;
  try { record = await adminAuth().getUserByEmail(user.email); }
  catch { record = await adminAuth().createUser({ email: user.email, password: user.password, displayName: user.displayName }); }
  await adminAuth().setCustomUserClaims(record.uid, { role: user.role, hospitalId: "H1", doctorId: user.doctorId ?? null });
  await adminDb().collection("users").doc(record.uid).set({ uid: record.uid, email: user.email, role: user.role, displayName: user.displayName, hospitalId: "H1", doctorId: user.doctorId ?? null, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function seed() {
  for (const user of DEMO_USERS) await ensureUser(user);
  const db = adminDb();
  const doctors = [
    { id: "d-mehta", name: "Dr. Ananya Mehta", departmentId: "general-medicine", department: "General Medicine", room: "Room 3", status: "busy", currentVisitId: "v-current", averageDuration: 9 },
    { id: "d-iyer", name: "Dr. Rohan Iyer", departmentId: "general-medicine", department: "General Medicine", room: "Room 4", status: "available", currentVisitId: null, averageDuration: 8 },
    { id: "d-shah", name: "Dr. Neel Shah", departmentId: "orthopedics", department: "Orthopedics", room: "Room 7", status: "paused", currentVisitId: null, averageDuration: 13 },
  ];
  await Promise.all(doctors.map(({ id, ...doctor }) => db.collection("doctors").doc(id).set({ ...doctor, hospitalId: "H1", updatedAt: FieldValue.serverTimestamp() }, { merge: true })));
  const visits = [
    { id: "v-current", patientId: "p-001", patientName: "Aarav Sharma", age: 39, email: "", trackingKey: "demo-current", token: "GM-077", doctorId: "d-mehta", departmentId: "general-medicine", complaintText: "Fever and fatigue", complaintCategory: "fever", priorityLevel: 0, sequenceNumber: 0, status: "in_consultation", predictedDurationMin: 8, consultationStartedAt: new Date(Date.now() - 3 * 60000) },
    { id: "v-078", patientId: "p-002", patientName: "Meera Joshi", age: 28, email: "", token: "GM-078", doctorId: "d-mehta", departmentId: "general-medicine", complaintText: "Persistent headache", complaintCategory: "headache", priorityLevel: 0, sequenceNumber: 1, status: "waiting", predictedDurationMin: 6 },
    { id: "v-079", patientId: "p-003", patientName: "Rahul Verma", age: 52, email: "", token: "GM-079", doctorId: "d-mehta", departmentId: "general-medicine", complaintText: "Follow-up consultation", complaintCategory: "follow_up", priorityLevel: 0, sequenceNumber: 2, status: "waiting", predictedDurationMin: 5 },
    { id: "v-080", patientId: "p-004", patientName: "Ishita Rao", age: 34, email: "", trackingKey: "demo-gm-080", token: "GM-080", doctorId: "d-mehta", departmentId: "general-medicine", complaintText: "General consultation", complaintCategory: "general", priorityLevel: 0, sequenceNumber: 3, status: "waiting", predictedDurationMin: 8 },
    { id: "v-b31", patientId: "p-005", patientName: "Kabir Khan", age: 42, email: "", token: "GM-131", doctorId: "d-iyer", departmentId: "general-medicine", complaintText: "Fever", complaintCategory: "fever", priorityLevel: 0, sequenceNumber: 1, status: "waiting", predictedDurationMin: 8 },
    { id: "v-b32", patientId: "p-006", patientName: "Nisha Patel", age: 31, email: "", token: "GM-132", doctorId: "d-iyer", departmentId: "general-medicine", complaintText: "General consultation", complaintCategory: "general", priorityLevel: 0, sequenceNumber: 2, status: "waiting", predictedDurationMin: 8 },
  ];
  const batch = db.batch();
  for (const visit of visits) {
    batch.set(db.collection("patients").doc(visit.patientId), { name: visit.patientName, age: visit.age, email: visit.email, hospitalPatientNumber: visit.patientId.toUpperCase(), createdAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection("visits").doc(visit.id), { ...visit, hospitalId: "H1", registeredAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  for (const medicine of [{ id: "m-paracetamol", name: "Paracetamol 500mg", stockQuantity: 342, lowStockThreshold: 30, unit: "tablet", unitPrice: 1.2 }, { id: "m-amoxicillin", name: "Amoxicillin 250mg", stockQuantity: 18, lowStockThreshold: 30, unit: "capsule", unitPrice: 4.5 }, { id: "m-diclofenac", name: "Diclofenac gel", stockQuantity: 0, lowStockThreshold: 10, unit: "tube", unitPrice: 62 }]) batch.set(db.collection("medicines").doc(medicine.id), { ...medicine, stockStatus: medicine.stockQuantity === 0 ? "out_of_stock" : medicine.stockQuantity <= medicine.lowStockThreshold ? "low_stock" : "available", active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  await reforecastDoctorQueue("d-mehta", "seed"); await reforecastDoctorQueue("d-iyer", "seed");
  console.log("Clinicify demo users, doctors, visits, and inventory are ready.");
}
seed().catch(error => { console.error(error); process.exitCode = 1; });
