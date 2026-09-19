import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/authorization";
import { adjustInventory, completeConsultation, markNoShow, recordBilling, savePrescription, setDoctorPause, startConsultation, transferVisit, updatePharmacyStatus } from "@/lib/server/operations";

const allRoles = ["receptionist", "doctor", "pharmacist", "admin"] as const;
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  try {
    const actor = await requireRole(request, [...allRoles]); const body = await request.json(); const { action } = await params;
    if (action === "start") await startConsultation(body.visitId, body.doctorId, actor);
    else if (action === "complete") await completeConsultation(body.visitId, body.doctorId, actor);
    else if (action === "transfer") await transferVisit(body.visitId, body.destinationDoctorId, actor);
    else if (action === "no-show") await markNoShow(body.visitId, actor);
    else if (action === "pause") await setDoctorPause(body.doctorId, Boolean(body.paused), actor);
    else if (action === "prescription") await savePrescription(body, actor);
    else if (action === "pharmacy-status") await updatePharmacyStatus(body.orderId, body.status, actor);
    else if (action === "inventory") await adjustInventory(body.medicineId, Number(body.delta), actor);
    else if (action === "billing") await recordBilling(body.orderId, body.billingStatus, actor);
    else return NextResponse.json({ error: "Unknown operation" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Operation failed" }, { status: 403 }); }
}
