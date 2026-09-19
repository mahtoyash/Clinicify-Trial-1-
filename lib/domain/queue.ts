import type { ComplaintCategory, Doctor, QueueState, Visit } from "./types";

export const DURATION_MINUTES: Record<ComplaintCategory, number> = { general: 8, fever: 8, headache: 6, injury: 14, follow_up: 5 };
const TRANSITION_BUFFER = 2;
const ARRIVAL_BUFFER = 10;
export const uncertaintyFor = (minutes: number) => minutes <= 20 ? 5 : minutes <= 60 ? 10 : 15;

function activeQueue(state: QueueState, doctorId: string) {
  return state.visits.filter(v => v.doctorId === doctorId && v.status === "waiting")
    .sort((a, b) => b.priorityLevel - a.priorityLevel || (a.priorityInsertedAt ?? 0) - (b.priorityInsertedAt ?? 0) || a.sequenceNumber - b.sequenceNumber);
}

function currentRemaining(state: QueueState, doctor: Doctor, now: number) {
  if (!doctor.currentVisitId) return 0;
  const current = state.visits.find(v => v.id === doctor.currentVisitId);
  if (!current || !current.consultationStartedAt) return 0;
  const elapsed = Math.floor((now - current.consultationStartedAt) / 60000);
  return Math.max(current.predictedDuration - elapsed, 2);
}

/** Authoritative deterministic reforecast; only mutates the specified doctor's visits. */
export function reforecastDoctorQueue(state: QueueState, doctorId: string, now = Date.now()): QueueState {
  const doctor = state.doctors.find(d => d.id === doctorId);
  if (!doctor) return state;
  let workload = currentRemaining(state, doctor, now) + (doctor.status === "paused" ? 15 : 0);
  const updates = new Map<string, Pick<Visit, "etaLower" | "etaUpper" | "recommendedArrival">>();
  for (const visit of activeQueue(state, doctorId)) {
    const variance = uncertaintyFor(workload);
    updates.set(visit.id, { etaLower: now + Math.max(0, workload - variance) * 60000, etaUpper: now + (workload + variance) * 60000, recommendedArrival: now + Math.max(0, workload - variance - ARRIVAL_BUFFER) * 60000 });
    workload += visit.predictedDuration + TRANSITION_BUFFER;
  }
  return { ...state, visits: state.visits.map(v => updates.has(v.id) ? { ...v, ...updates.get(v.id)! } : v) };
}

export function insertPriority(state: QueueState, visit: Visit, doctorId: string, now = Date.now()): QueueState {
  const priorityVisit: Visit = { ...visit, doctorId, priorityLevel: 1, priorityInsertedAt: now, sequenceNumber: -1, status: "waiting", predictedDuration: DURATION_MINUTES[visit.complaintCategory] };
  const queued: QueueState = { ...state, visits: [...state.visits, priorityVisit], events: [...state.events, { id: `evt-${now}`, type: "PRIORITY_INSERTED", doctorId, visitId: visit.id, createdAt: now, actor: "authorized reception" }] };
  return reforecastDoctorQueue(queued, doctorId, now);
}

export function transferVisit(state: QueueState, visitId: string, destinationDoctorId: string, now = Date.now()): QueueState {
  const visit = state.visits.find(v => v.id === visitId);
  if (!visit || visit.doctorId === destinationDoctorId) return state;
  const moved: QueueState = { ...state, visits: state.visits.map(v => v.id === visitId ? { ...v, doctorId: destinationDoctorId, sequenceNumber: Date.now() } : v), events: [...state.events, { id: `transfer-${now}`, type: "PATIENT_TRANSFERRED", doctorId: destinationDoctorId, visitId, createdAt: now, actor: "reception" }] };
  return reforecastDoctorQueue(reforecastDoctorQueue(moved, visit.doctorId, now), destinationDoctorId, now);
}
