import { reforecastDoctorQueue } from "./domain/queue";
import type { QueueState } from "./domain/types";
const now = Date.now();
export const initialState: QueueState = reforecastDoctorQueue(reforecastDoctorQueue({
  doctors: [
    { id: "d-mehta", name: "Dr. Ananya Mehta", department: "General Medicine", room: "Room 3", status: "busy", currentVisitId: "v-current", averageDuration: 9 },
    { id: "d-iyer", name: "Dr. Rohan Iyer", department: "General Medicine", room: "Room 4", status: "available", averageDuration: 8 },
    { id: "d-shah", name: "Dr. Neel Shah", department: "Orthopedics", room: "Room 7", status: "paused", averageDuration: 13 }
  ],
  visits: [
    { id: "v-current", patientId: "p-001", patientName: "Aarav Sharma", age: 39, token: "GM-077", doctorId: "d-mehta", complaint: "Fever and fatigue", complaintCategory: "fever", priorityLevel: 0, sequenceNumber: 0, status: "in_consultation", predictedDuration: 8, consultationStartedAt: now - 3 * 60000 },
    { id: "v-078", patientId: "p-002", patientName: "Meera Joshi", age: 28, token: "GM-078", doctorId: "d-mehta", complaint: "Persistent headache", complaintCategory: "headache", priorityLevel: 0, sequenceNumber: 1, status: "waiting", predictedDuration: 6 },
    { id: "v-079", patientId: "p-003", patientName: "Rahul Verma", age: 52, token: "GM-079", doctorId: "d-mehta", complaint: "Follow-up consultation", complaintCategory: "follow_up", priorityLevel: 0, sequenceNumber: 2, status: "waiting", predictedDuration: 5 },
    { id: "v-080", patientId: "p-004", patientName: "Ishita Rao", age: 34, token: "GM-080", doctorId: "d-mehta", complaint: "General consultation", complaintCategory: "general", priorityLevel: 0, sequenceNumber: 3, status: "waiting", predictedDuration: 8 },
    { id: "v-b31", patientId: "p-005", patientName: "Kabir Khan", age: 42, token: "GM-131", doctorId: "d-iyer", complaint: "Fever", complaintCategory: "fever", priorityLevel: 0, sequenceNumber: 1, status: "waiting", predictedDuration: 8 },
    { id: "v-b32", patientId: "p-006", patientName: "Nisha Patel", age: 31, token: "GM-132", doctorId: "d-iyer", complaint: "General consultation", complaintCategory: "general", priorityLevel: 0, sequenceNumber: 2, status: "waiting", predictedDuration: 8 }
  ], events: []
}, "d-mehta", now), "d-iyer", now);
