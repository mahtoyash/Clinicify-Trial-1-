import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import type { Role } from "@/lib/domain/types";

export async function requireRole(request: NextRequest, allowed: Role[]) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthenticated");
  const decoded = await adminAuth().verifyIdToken(token);
  const role = decoded.role as Role | undefined;
  if (!role || !allowed.includes(role)) throw new Error("Permission denied");
  return { uid: decoded.uid, role, doctorId: typeof decoded.doctorId === "string" ? decoded.doctorId : undefined, department: typeof decoded.department === "string" ? decoded.department : undefined };
}
