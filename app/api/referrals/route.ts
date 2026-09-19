import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRole(request, ["receptionist", "admin"]);
    if (actor.role === "receptionist" && !actor.department) throw new Error("Your reception account needs a department assignment.");
    const snapshot = await adminDb().collection("referralRequests").where("status", "==", "pending_allocation").get();
    const referrals = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as { department?: string; [key: string]: unknown }) })).filter(item => actor.role === "admin" || item.department === actor.department);
    return NextResponse.json({ referrals });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load referrals" }, { status: 403 }); }
}
