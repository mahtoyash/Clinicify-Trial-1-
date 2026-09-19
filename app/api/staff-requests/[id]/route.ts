import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";
import type { Role } from "@/lib/domain/types";

async function review(request: NextRequest, { params }: { params: Promise<{ id:string }> }) {
  try {
    const actor = await requireRole(request,["admin"]); const { id } = await params; const { status } = await request.json();
    if (!["approved","cancelled"].includes(status)) throw new Error("Invalid request decision.");
    const ref = adminDb().collection("staffRequests").doc(id); const requestDoc = await ref.get(); const data = requestDoc.data(); if (!requestDoc.exists || !data || data.status !== "pending") throw new Error("This request is no longer pending.");
    await ref.update({ status, reviewedBy:actor.uid, reviewedAt:FieldValue.serverTimestamp() });
    if (status === "approved") { const role=data.role as Role; const doctorId=role === "doctor" ? `doctor-${data.uid}` : null; await adminAuth().setCustomUserClaims(data.uid,{ role, hospitalId:"H1", department:data.department, doctorId }); await adminDb().collection("users").doc(data.uid).set({ uid:data.uid, email:data.email, displayName:data.displayName, role, department:data.department, staffId:data.staffId, doctorId, hospitalId:"H1", active:true, updatedAt:FieldValue.serverTimestamp() },{merge:true}); if(doctorId) await adminDb().collection("doctors").doc(doctorId).set({ name:data.displayName, department:data.department, departmentId:data.department.toLowerCase().replaceAll(" ","-"), room:"Unassigned", status:"available", averageDuration:8, hospitalId:"H1", updatedAt:FieldValue.serverTimestamp() },{merge:true}); }
    return NextResponse.json({ ok:true });
  } catch(error) { return NextResponse.json({ error:error instanceof Error ? error.message : "Unable to review request" },{status:403}); }
}
export const PATCH = review;
export const POST = review;
