import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function adminApp() {
  if (getApps().length) return getApps()[0]!;
  const credentialPath = process.env.FIREBASE_ADMIN_CREDENTIAL_PATH;
  if (!credentialPath) throw new Error("FIREBASE_ADMIN_CREDENTIAL_PATH is not configured.");
  const credential = JSON.parse(readFileSync(resolve(process.cwd(), credentialPath), "utf8"));
  return initializeApp({ credential: cert(credential) });
}
export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
