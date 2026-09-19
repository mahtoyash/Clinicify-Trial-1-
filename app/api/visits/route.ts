import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/authorization";
import { createVisit } from "@/lib/server/queue-service";
export async function POST(request: NextRequest) { try { const actor = await requireRole(request, ["receptionist", "admin"]); const body = await request.json(); return NextResponse.json(await createVisit(body, actor.uid)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create visit" }, { status: 403 }); } }
