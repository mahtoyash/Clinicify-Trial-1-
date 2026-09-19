import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";

/** Doctor-safe catalog: deliberately omits exact quantities and unit prices. */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["doctor", "admin"]);
    const medicines = await adminDb().collection("medicines").where("active", "!=", false).get();
    return NextResponse.json({ medicines: medicines.docs.map(doc => ({ id: doc.id, name: doc.data().name, unit: doc.data().unit, stockStatus: doc.data().stockStatus })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load medicines" }, { status: 403 });
  }
}
