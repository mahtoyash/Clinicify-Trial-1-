import { config } from "dotenv";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../lib/firebase/admin";
import type { Role } from "../lib/domain/types";

config({ path: ".env.local" });

const STAFF: Array<{ email:string; password:string; role:Role; displayName:string; department?:string; doctorId?:string }> = [
  { email:"reception@clinicify.test", password:"R12345678", role:"receptionist", displayName:"Riya Menon", department:"General Medicine" },
  { email:"reception.cardiology@clinicify.test", password:"R12345678", role:"receptionist", displayName:"Neha Kapoor", department:"Cardiology" },
  { email:"doctor@clinicify.test", password:"D12345678", role:"doctor", displayName:"Dr. Ananya Mehta", department:"General Medicine", doctorId:"d-mehta" },
  { email:"doctor.cardiology@clinicify.test", password:"D12345678", role:"doctor", displayName:"Dr. Rohan Iyer", department:"Cardiology", doctorId:"d-iyer" },
  { email:"pharmacy@clinicify.test", password:"P12345678", role:"pharmacist", displayName:"Aman Singh" },
  { email:"admin@clinicify.test", password:"A12345678", role:"admin", displayName:"Arjun Rao" },
];
const doctors = [
  { id:"d-mehta", name:"Dr. Ananya Mehta", department:"General Medicine", departmentId:"general-medicine", room:"Room 3", status:"available", averageDuration:9 },
  { id:"d-iyer", name:"Dr. Rohan Iyer", department:"Cardiology", departmentId:"cardiology", room:"Room 4", status:"available", averageDuration:8 },
];
const medicines = [
  ["m-paracetamol","Paracetamol 500mg","tablet",1.2], ["m-amoxicillin","Amoxicillin 250mg","capsule",4.5], ["m-ibuprofen","Ibuprofen 400mg","tablet",2.1], ["m-azithromycin","Azithromycin 500mg","tablet",14], ["m-omeprazole","Omeprazole 20mg","capsule",3.8], ["m-cetirizine","Cetirizine 10mg","tablet",1.4], ["m-metformin","Metformin 500mg","tablet",1.7], ["m-amlodipine","Amlodipine 5mg","tablet",2.5], ["m-atorvastatin","Atorvastatin 10mg","tablet",4], ["m-ors","ORS Sachet","sachet",12],
] as const;

async function ensureStaff(staff: (typeof STAFF)[number]) { let user; try { user = await adminAuth().getUserByEmail(staff.email); } catch { user = await adminAuth().createUser({ email:staff.email, password:staff.password, displayName:staff.displayName }); } const claims = { role:staff.role, hospitalId:"H1", doctorId:staff.doctorId ?? null, department:staff.department ?? null }; await adminAuth().setCustomUserClaims(user.uid, claims); await adminDb().collection("users").doc(user.uid).set({ uid:user.uid, email:staff.email, displayName:staff.displayName, ...claims, active:true, updatedAt:FieldValue.serverTimestamp() }, { merge:true }); }
async function clearCollection(name: string) { const db = adminDb(); const snapshot = await db.collection(name).get(); while (!snapshot.empty) { const batch = db.batch(); snapshot.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); const next = await db.collection(name).get(); if (next.empty) break; } }
async function seed() { for (const name of ["patients", "visits", "prescriptions", "pharmacyOrders", "queueEvents", "notifications", "referralRequests", "doctors", "medicines", "queues"]) await clearCollection(name); for (const staff of STAFF) await ensureStaff(staff); const db = adminDb(); const batch = db.batch(); doctors.forEach(({ id, ...doctor }) => batch.set(db.collection("doctors").doc(id), { ...doctor, hospitalId:"H1", currentVisitId:null, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() })); medicines.forEach(([id, name, unit, unitPrice]) => batch.set(db.collection("medicines").doc(id), { name, unit, unitPrice, stockQuantity:100, lowStockThreshold:10, stockStatus:"available", active:true, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() })); await batch.commit(); console.log("Clinicify reset: 2 doctors, named staff, and medicine catalogue only. No patient, visit, prescription, referral, bill, or queue demo data exists."); }
seed().catch(error => { console.error(error); process.exitCode = 1; });
