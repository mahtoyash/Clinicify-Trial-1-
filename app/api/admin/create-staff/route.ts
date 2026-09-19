import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/server/authorization";
import type { Role } from "@/lib/domain/types";

const allowedRoles: Role[] = ["receptionist", "doctor", "pharmacist"];

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]);
    const body = await request.json();

    const { email, password, displayName, role, department, doctorId, room } = body;
    if (!email || !password || !displayName || !role) {
      throw new Error("Email, password, display name, and role are required.");
    }
    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid role. Must be receptionist, doctor, or pharmacist.");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    // Create the Firebase Auth user
    let user;
    try {
      user = await adminAuth().getUserByEmail(email);
      throw new Error("A user with this email already exists.");
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) throw err;
      // User doesn't exist yet, create them
      user = await adminAuth().createUser({
        email,
        password,
        displayName,
      });
    }

    // Set custom claims
    const claims: Record<string, unknown> = {
      role,
      hospitalId: "H1",
      doctorId: doctorId || null,
      department: department || null,
    };
    await adminAuth().setCustomUserClaims(user.uid, claims);

    // Create user doc
    await adminDb().collection("users").doc(user.uid).set({
      uid: user.uid,
      email,
      displayName,
      ...claims,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // If doctor, create a doctor record
    if (role === "doctor" && doctorId && room && department) {
      await adminDb().collection("doctors").doc(doctorId).set({
        name: displayName,
        department,
        departmentId: department.toLowerCase().replaceAll(" ", "-"),
        room,
        status: "available",
        hospitalId: "H1",
        currentVisitId: null,
        averageDuration: 10,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ uid: user.uid, email, role, displayName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create staff account" },
      { status: 400 }
    );
  }
}
