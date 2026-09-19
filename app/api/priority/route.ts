import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/authorization";
import { insertPriorityVisit } from "@/lib/server/queue-service";
export async function POST(request: NextRequest) { try { const actor = await requireRole(request, ["receptionist", "admin"]); const { visitId, doctorId } = await request.json(); await insertPriorityVisit(visitId, doctorId, actor.uid, actor.role); return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to insert priority visit" }, { status: 403 }); } }
