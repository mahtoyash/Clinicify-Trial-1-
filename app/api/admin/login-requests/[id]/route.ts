import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(request, ["admin"]);
    const body = await request.json();
    const { status } = body; // "approved" or "rejected"
    
    if (status !== "approved" && status !== "rejected") {
      throw new Error("Invalid status");
    }

    await adminDb().collection("loginRequests").doc(params.id).update({ status });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update request" },
      { status: 403 }
    );
  }
}
