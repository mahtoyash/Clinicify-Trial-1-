import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";
import type { Role } from "@/lib/domain/types";

const allowedRoles: Role[] = ["receptionist", "doctor", "pharmacist", "admin"];

async function authenticatedUid(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in before requesting access.");
  return (await adminAuth().verifyIdToken(token)).uid;
}

export async function POST(request: NextRequest) {
  try {
    const uid = await authenticatedUid(request); const body = await request.json();
    if (!allowedRoles.includes(body.role) || typeof body.department !== "string" || typeof body.staffId !== "string" || !body.staffId.trim()) throw new Error("Role, department, and staff ID are required.");
    const user = await adminAuth().getUser(uid);
    const existing = await adminDb().collection("staffRequests").where("uid", "==", uid).where("status", "==", "pending").limit(1).get();
    if (!existing.empty) throw new Error("You already have a pending access request.");
    const requestRef = await adminDb().collection("staffRequests").add({ uid, email:user.email ?? "", displayName:body.displayName?.trim() || user.displayName || "Staff applicant", role:body.role, department:body.department, staffId:body.staffId.trim(), status:"pending", createdAt:FieldValue.serverTimestamp() });
    return NextResponse.json({ id:requestRef.id, status:"pending" });
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "Unable to create request" }, { status:403 }); }
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]); const snapshot = await adminDb().collection("staffRequests").orderBy("createdAt", "desc").get();
    return NextResponse.json({ requests:snapshot.docs.map(doc=>({ id:doc.id, ...doc.data(), createdAt:doc.data().createdAt?.toMillis?.() ?? null })) });
  } catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : "Unable to load requests" }, { status:403 }); }
}
