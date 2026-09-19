export type Role = "receptionist" | "doctor" | "pharmacist" | "admin";
export type VisitStatus = "waiting" | "in_consultation" | "completed" | "no_show";
export type DoctorStatus = "available" | "busy" | "paused";
export type PriorityLevel = 0 | 1;

export interface Doctor {
  id: string; name: string; department: string; room: string; status: DoctorStatus;
  departmentId?: string; currentVisitId?: string; averageDuration: number;
}
export interface Visit {
  id: string; patientId: string; patientName: string; age: number; token: string; doctorId: string;
  complaint: string; complaintCategory: ComplaintCategory; priorityLevel: PriorityLevel;
  priorityInsertedAt?: number; sequenceNumber: number; status: VisitStatus; predictedDuration: number;
  etaLower?: number; etaUpper?: number; recommendedArrival?: number; consultationStartedAt?: number;
  consultationEndedAt?: number; registeredAt?: number; actualDuration?: number; etaRevisionCount?: number; predictionErrorMin?: number;
}
export type ComplaintCategory = "general" | "fever" | "headache" | "injury" | "follow_up";
export interface QueueEvent { id: string; type: "PRIORITY_INSERTED" | "VISIT_CREATED" | "CONSULTATION_ENDED" | "PATIENT_TRANSFERRED"; doctorId: string; visitId: string; createdAt: number; actor: string; }
export interface QueueState { doctors: Doctor[]; visits: Visit[]; events: QueueEvent[]; }
