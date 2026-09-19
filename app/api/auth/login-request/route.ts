import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Missing auth token.");
    
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const role = decoded.role as string;
    
    if (role === "admin") {
      return NextResponse.json({ status: "approved" });
    }

    const user = await adminAuth().getUser(uid);

    // Check if there's already a pending or approved login request for today?
    // Let's just create a new one every time they request. 
    // Wait, if they already have a "pending" one, return its ID.
    // If they have an "approved" one created in the last 24h, we could bypass?
    // The user requested: "every time this 3 types log in there should be a request go to admin"
    
    // Check for existing pending request to avoid spamming
    const existingPending = await adminDb()
      .collection("loginRequests")
      .where("uid", "==", uid)
      .where("status", "==", "pending")
      .limit(1)
      .get();
      
    if (!existingPending.empty) {
      return NextResponse.json({ id: existingPending.docs[0].id, status: "pending" });
    }

    const requestRef = await adminDb().collection("loginRequests").add({
      uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "Staff",
      role,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: requestRef.id, status: "pending" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create login request" },
      { status: 403 }
    );
  }
}
