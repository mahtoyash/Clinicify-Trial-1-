import { config } from "dotenv";
import { adminDb } from "../lib/firebase/admin";

config({ path: ".env.local" });

const collections = ["patients", "visits", "prescriptions", "pharmacyOrders", "queueEvents", "notifications"];

async function clearDemoClinicalData() {
  const db = adminDb();
  for (const name of collections) {
    let snapshot = await db.collection(name).get();
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.slice(0, 400).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      snapshot = await db.collection(name).get();
    }
  }
  const doctors = await db.collection("doctors").get();
  await Promise.all(doctors.docs.map(doc => doc.ref.set({ status: "available", currentVisitId: null }, { merge: true })));
  console.log("Cleared seeded clinical records; retained rooms, doctors, staff, and medicine catalog.");
}

clearDemoClinicalData().catch(error => { console.error(error); process.exitCode = 1; });
