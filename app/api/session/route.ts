import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/authorization";
export async function GET(request: NextRequest) { try { return NextResponse.json(await requireRole(request, ["receptionist", "doctor", "pharmacist", "admin"])); } catch { return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); } }
