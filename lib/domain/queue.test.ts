import { describe, expect, it } from "vitest";
import { initialState } from "../demo-data";
import { insertPriority, transferVisit } from "./queue";
import type { Visit } from "./types";
const priority: Visit = { id: "v-emergency", patientId: "p-e", patientName: "Priority patient", age: 45, token: "E-04", doctorId: "d-mehta", complaint: "Injury", complaintCategory: "injury", priorityLevel: 0, sequenceNumber: 0, status: "waiting", predictedDuration: 14 };
describe("doctor-specific queue reforecasting", () => {
  it("priority in Dr A changes Dr A but not Dr B", () => { const beforeB = initialState.visits.find(v => v.id === "v-b31")!.etaUpper; const after = insertPriority(initialState, priority, "d-mehta", 1000000); expect(after.visits.find(v => v.id === "v-078")!.etaUpper).not.toBe(initialState.visits.find(v => v.id === "v-078")!.etaUpper); expect(after.visits.find(v => v.id === "v-b31")!.etaUpper).toBe(beforeB); });
  it("transfer reforecasts both source and destination", () => { const next = transferVisit(initialState, "v-079", "d-iyer", 1000000); expect(next.visits.find(v => v.id === "v-079")!.doctorId).toBe("d-iyer"); expect(next.events.at(-1)?.type).toBe("PATIENT_TRANSFERRED"); });
});
