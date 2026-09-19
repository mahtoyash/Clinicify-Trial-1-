import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET() {
  const db = adminDb();
  const snapshot = await db.collection("medicines").get();
  const medicines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return NextResponse.json({ medicines });
}
