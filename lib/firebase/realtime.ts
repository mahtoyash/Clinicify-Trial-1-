"use client";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "./client";
import type { Doctor, QueueEvent, QueueState, Visit } from "@/lib/domain/types";
const millis = (value: unknown) => typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : undefined;
export function subscribeClinicify(onState: (state: QueueState) => void) {
  let doctors: Doctor[] = []; let visits: Visit[] = []; let events: QueueEvent[] = [];
  const publish = () => onState({ doctors, visits, events });
  const unsubs = [
    onSnapshot(collection(firestore, "doctors"), snapshot => { doctors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor)); publish(); }),
    onSnapshot(collection(firestore, "visits"), snapshot => { visits = snapshot.docs.map(doc => { const d = doc.data(); return { id: doc.id, patientId: d.patientId, patientName: d.patientName ?? "Patient", age: d.age ?? 0, token: d.token, doctorId: d.doctorId, complaint: d.complaintText ?? "General consultation", complaintCategory: d.complaintCategory, priorityLevel: d.priorityLevel ?? 0, priorityInsertedAt: millis(d.priorityInsertedAt), sequenceNumber: d.sequenceNumber ?? 0, status: d.status, predictedDuration: d.predictedDurationMin ?? 8, etaLower: millis(d.etaLower), etaUpper: millis(d.etaUpper), recommendedArrival: millis(d.recommendedArrival), consultationStartedAt: millis(d.consultationStartedAt), consultationEndedAt: millis(d.consultationEndedAt) } as Visit; }); publish(); }),
    onSnapshot(collection(firestore, "queueEvents"), snapshot => { events = snapshot.docs.map(doc => { const d = doc.data(); return { id: doc.id, type: d.eventType, doctorId: d.doctorId ?? "", visitId: d.visitId ?? "", createdAt: millis(d.createdAt) ?? Date.now(), actor: d.actorUid ?? "" } as QueueEvent; }); publish(); }),
  ];
  return () => unsubs.forEach(unsubscribe => unsubscribe());
}
