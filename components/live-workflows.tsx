"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { QueueState } from "@/lib/domain/types";

/* ── Shared types ─────────────────────────────── */
type Call = (path: string, body?: unknown) => Promise<unknown>;
type Row  = { id: string; [key: string]: unknown };
type NotifyFn = (msg: string, type?: "success" | "error" | "info") => void;

const DEPARTMENTS = [
  "General Medicine", "Gynecology", "Pediatrics", "Radiology",
  "ENT", "Dentistry", "Neurology", "Cardiology", "Orthopedics",
  "Dermatology", "Ophthalmology", "Psychiatry",
];

const MEDICINES_STATIC = [
  { id: "m-paracetamol",  name: "Paracetamol 500mg",        stockStatus: "available" },
  { id: "m-amoxicillin",  name: "Amoxicillin 250mg",         stockStatus: "available" },
  { id: "m-ibuprofen",    name: "Ibuprofen 400mg",           stockStatus: "available" },
  { id: "m-cetirizine",   name: "Cetirizine 10mg",           stockStatus: "available" },
  { id: "m-metformin",    name: "Metformin 500mg",           stockStatus: "available" },
  { id: "m-amlodipine",   name: "Amlodipine 5mg",            stockStatus: "low_stock" },
  { id: "m-omeprazole",   name: "Omeprazole 20mg",           stockStatus: "available" },
  { id: "m-azithromycin", name: "Azithromycin 500mg",        stockStatus: "available" },
  { id: "m-atorvastatin", name: "Atorvastatin 10mg",         stockStatus: "available" },
  { id: "m-ors",          name: "ORS Sachet",                stockStatus: "available" },
];

/* ── Firestore live collection hook ─────────────── */
function useRows(collectionName: string): Row[] {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    const q = query(collection(firestore, collectionName), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setRows(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), () => setRows([]));
  }, [collectionName]);
  return rows;
}

/* ── Helper: call API with loading ─────────────── */
async function run(
  call: Call,
  notify: NotifyFn,
  action: string,
  body: unknown,
  successMsg?: string,
): Promise<unknown> {
  try {
    const result = await call(`/api/operations/${action}`, body);
    notify(successMsg ?? `${action.replaceAll("-", " ")} completed.`, "success");
    return result;
  } catch (err) {
    notify(err instanceof Error ? err.message : "Action failed.", "error");
    return undefined;
  }
}

/* ── Waiting count helper ────────────────────────── */
const waitingFor = (state: QueueState, doctorId: string) =>
  state.visits.filter(v => v.doctorId === doctorId && v.status === "waiting");

/* ════════════════════════════════════════════════
   ADMIN LIVE
   ════════════════════════════════════════════════ */
type RequestRow = Row & { status: "pending" | "approved" | "cancelled" | string };

export function AdminLive({ state, callApi, notify }: { state: QueueState; callApi: Call; notify: NotifyFn }) {
  const loginRequests = useRows("loginRequests") as RequestRow[];
  const orders = useRows("pharmacyOrders");
  const [adminTab, setAdminTab] = useState<"dashboard" | "create-staff">("dashboard");
  const [busy, setBusy] = useState<string>("");

  // Create staff form state
  const [staffForm, setStaffForm] = useState({ email: "", password: "", displayName: "", role: "receptionist" as string, department: "General Medicine", doctorId: "", room: "" });
  const [staffBusy, setStaffBusy] = useState(false);

  const pendingCount = loginRequests.filter(r => r.status === "pending").length;

  const review = async (id: string, status: "approved" | "rejected") => {
    setBusy(id + status);
    try {
      await callApi(`/api/admin/login-requests/${id}`, { status });
      notify(
        status === "approved"
          ? "Login request approved ✅"
          : "Login request rejected 🚫",
        status === "approved" ? "success" : "info",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Review failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffBusy(true);
    try {
      const result = await callApi("/api/admin/create-staff", {
        email: staffForm.email.trim(),
        password: staffForm.password,
        displayName: staffForm.displayName.trim(),
        role: staffForm.role,
        department: staffForm.role !== "pharmacist" ? staffForm.department : "",
        doctorId: staffForm.role === "doctor" ? staffForm.doctorId.trim() : "",
        room: staffForm.role === "doctor" ? staffForm.room.trim() : "",
      });
      if (result) {
        notify(`✅ Staff account created for ${staffForm.displayName.trim()} (${staffForm.role}).`, "success");
        setStaffForm({ email: "", password: "", displayName: "", role: "receptionist", department: "General Medicine", doctorId: "", room: "" });
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create staff account.", "error");
    } finally {
      setStaffBusy(false);
    }
  };

  // Stats
  const totalWaiting = state.visits.filter(v => v.status === "waiting").length;
  const totalInConsult = state.visits.filter(v => v.status === "in_consultation").length;
  const totalCompleted = state.visits.filter(v => v.status === "completed").length;
  const pendingOrders = orders.filter(o => String(o.status) !== "dispensed").length;
  const dispensedOrders = orders.filter(o => String(o.status) === "dispensed").length;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Admin Portal</div>
          <h1 className="page-title">Hospital Dashboard</h1>
          <p className="page-subtitle">Manage rooms, staff, and monitor OPD flow.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${adminTab === "dashboard" ? "btn-primary" : "btn-secondary"}`} onClick={() => setAdminTab("dashboard")}>📊 Dashboard</button>
          <button className={`btn ${adminTab === "create-staff" ? "btn-primary" : "btn-secondary"}`} onClick={() => setAdminTab("create-staff")}>➕ Create Staff</button>
        </div>
      </div>

      {adminTab === "dashboard" ? (
        <>
          {/* Stats Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Waiting", value: totalWaiting, icon: "⏳", color: "var(--amber)" },
              { label: "In Consultation", value: totalInConsult, icon: "🩺", color: "var(--blue)" },
              { label: "Completed Today", value: totalCompleted, icon: "✅", color: "var(--green)" },
              { label: "Pharmacy Pending", value: pendingOrders, icon: "💊", color: "var(--amber)" },
              { label: "Dispensed", value: dispensedOrders, icon: "📦", color: "var(--green)" },
              { label: "Login Requests", value: pendingCount, icon: "🔐", color: pendingCount > 0 ? "var(--red, #e74c3c)" : "var(--muted)" },
            ].map(stat => (
              <div key={stat.label} className="card" style={{ padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{stat.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Pending Login Requests */}
          {pendingCount > 0 && (
            <div className="card" style={{ marginBottom: 24, border: "2px solid var(--red, #e74c3c)" }}>
              <div className="card-header" style={{ paddingBottom: 12 }}>
                <div className="card-title">🔐 Live Login Requests ({pendingCount})</div>
              </div>
              <div className="card-body" style={{ paddingTop: 0 }}>
                <div className="req-list">
                  {loginRequests.filter(r => r.status === "pending").map(req => (
                    <div key={req.id} className="req-card">
                      <div className="req-card-info">
                        <div className="req-card-name">{String(req.displayName ?? "Unknown")}</div>
                        <div className="req-card-meta">
                          <span className="req-card-meta-item">✉️ {String(req.email ?? "—")}</span>
                          <span className="req-card-meta-item">🎭 {String(req.role ?? "—")}</span>
                        </div>
                      </div>
                      <div className="req-card-actions">
                        <button className="btn btn-success btn-sm" disabled={busy === req.id + "approved"} onClick={() => void review(req.id, "approved")}>
                          {busy === req.id + "approved" ? <span className="btn-spinner dark" /> : null} Approve
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busy === req.id + "rejected"} onClick={() => void review(req.id, "rejected")}>
                          {busy === req.id + "rejected" ? <span className="btn-spinner dark" /> : null} Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Live Rooms */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header" style={{ paddingBottom: 16 }}>
              <div className="card-title">🏥 Live Rooms</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {state.doctors.length === 0 ? (
                <p className="text-muted text-sm">No doctor rooms configured.</p>
              ) : (
                <div className="rooms-panel">
                  {state.doctors.map(doc => {
                    const waiting = waitingFor(state, doc.id).length;
                    const currentVisit = state.visits.find(v => v.id === doc.currentVisitId);
                    return (
                      <div key={doc.id} className="room-mini-card">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div className="room-mini-name">{doc.room} · {doc.name}</div>
                          <span className={`badge ${doc.status === "available" ? "badge-green" : doc.status === "busy" ? "badge-blue" : "badge-amber"}`}>
                            {doc.status}
                          </span>
                        </div>
                        <div className="room-mini-meta">
                          {doc.department} · {waiting} waiting
                          {currentVisit ? ` · Seeing: ${currentVisit.patientName} (${currentVisit.token})` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </>
      ) : (
        /* Create Staff Tab */
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-header" style={{ paddingBottom: 16 }}>
            <div className="card-title">➕ Create New Staff Account</div>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <form onSubmit={handleCreateStaff} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-field">
                <label className="form-label">Role *</label>
                <select className="form-select" value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="receptionist">🧑‍💼 Receptionist</option>
                  <option value="doctor">🩺 Doctor</option>
                  <option value="pharmacist">💊 Pharmacist</option>
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Full Name *</label>
                <input className="form-input" required value={staffForm.displayName} onChange={e => setStaffForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Dr. / Mr. / Ms. Full Name" />
              </div>

              <div className="form-field">
                <label className="form-label">Email *</label>
                <input className="form-input" required type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@clinicify.test" />
              </div>

              <div className="form-field">
                <label className="form-label">Password * (min 8 chars)</label>
                <input className="form-input" required type="password" minLength={8} value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" />
              </div>

              {staffForm.role !== "pharmacist" && (
                <div className="form-field">
                  <label className="form-label">Department *</label>
                  <select className="form-select" value={staffForm.department} onChange={e => setStaffForm(f => ({ ...f, department: e.target.value }))}>
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {staffForm.role === "doctor" && (
                <>
                  <div className="form-row">
                    <div className="form-field">
                      <label className="form-label">Doctor ID *</label>
                      <input className="form-input" required value={staffForm.doctorId} onChange={e => setStaffForm(f => ({ ...f, doctorId: e.target.value }))} placeholder="e.g. doc-smith" />
                    </div>
                    <div className="form-field">
                      <label className="form-label">Room *</label>
                      <input className="form-input" required value={staffForm.room} onChange={e => setStaffForm(f => ({ ...f, room: e.target.value }))} placeholder="e.g. Room 5" />
                    </div>
                  </div>
                </>
              )}

              <button className="btn btn-primary btn-full btn-lg" disabled={staffBusy}>
                {staffBusy ? <><span className="btn-spinner" /> Creating…</> : "Create Staff Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════
   RECEPTION LIVE
   ════════════════════════════════════════════════ */

// Departments with emoji icons
const DEPT_LIST = [
  { key: "General Medicine",  label: "General Medicine",  icon: "🏥", desc: "General OPD, fever, cough, cold"         },
  { key: "ENT",               label: "ENT (Ear/Nose/Throat)", icon: "👂", desc: "Ear pain, sinusitis, throat problems" },
  { key: "Ophthalmology",     label: "Ophthalmology (Eyes)",  icon: "👁️", desc: "Eye pain, vision issues, infection"  },
  { key: "Dentistry",         label: "Dentistry (Teeth)",     icon: "🦷", desc: "Tooth pain, cavity, gum issues"      },
  { key: "Neurology",         label: "Neurology",             icon: "🧠", desc: "Headache, seizures, nerve issues"    },
  { key: "Cardiology",        label: "Cardiology (Heart)",    icon: "❤️", desc: "Chest pain, BP, heart concerns"      },
  { key: "Radiology",         label: "Radiology (Imaging)",   icon: "🩻", desc: "X-ray, MRI, CT scan requests"       },
  { key: "Orthopedics",       label: "Orthopedics (Bones)",   icon: "🦴", desc: "Joint pain, fractures, sports injury"},
  { key: "Gynecology",        label: "Gynecology",            icon: "🌸", desc: "Women's health, OB/GYN"             },
  { key: "Pediatrics",        label: "Pediatrics (Children)", icon: "👶", desc: "Child health, vaccination, growth"   },
  { key: "Dermatology",       label: "Dermatology (Skin)",    icon: "🧴", desc: "Skin rash, acne, allergy, infection" },
  { key: "Psychiatry",        label: "Psychiatry (Mental)",   icon: "🧘", desc: "Mental health, anxiety, counseling"  },
];

type PatientForm = {
  name: string; age: string; mobile: string;
  temp: string; unit: "F" | "C"; weight: string; remark: string;
};

export function ReceptionLive({ state, department: receptionDept, callApi, notify }: {
  state: QueueState; department?: string; callApi: Call; notify: NotifyFn;
}) {
  const [form, setForm] = useState<PatientForm>({ name: "", age: "", mobile: "", temp: "", unit: "F", weight: "", remark: "" });
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState("");
  const [choosingBusy, setChoosingBusy] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [view, setView] = useState<"register" | "queue">("register");
  const referrals = useRows("referralRequests");

  // If the receptionist's own department is set, pre-filter. Otherwise let them pick.
  const effectiveDept = receptionDept ?? selectedDept;

  // Doctors matching the selected department
  const filteredDoctors = effectiveDept
    ? state.doctors.filter(d => d.department === effectiveDept)
    : state.doctors;

  // All visits that are waiting or in_consultation (the live queue)
  const queueVisits = state.visits.filter(v => v.status === "waiting" || v.status === "in_consultation");

  const ch = (k: keyof PatientForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim())         return notify("Patient name is required.", "error");
    if (!form.age || Number(form.age) < 0 || Number(form.age) > 130) return notify("Enter a valid age.", "error");
    if (!form.mobile.trim())       return notify("Mobile number is required.", "error");
    if (!form.remark.trim())       return notify("Please describe the patient's problem.", "error");
    if (!effectiveDept)            return notify("Please select a department for this patient.", "error");
    setSaveBusy(true);
    setTimeout(() => { setSaved(true); setSaveBusy(false); }, 400);
  };

  const handleReset = () => {
    setForm({ name: "", age: "", mobile: "", temp: "", unit: "F", weight: "", remark: "" });
    if (!receptionDept) setSelectedDept("");
    setSaved(false);
    setToken("");
  };

  const choose = async (doctorId: string) => {
    // Prevent duplicate clicks — if token already assigned, do nothing
    if (token) return;
    const doctor = filteredDoctors.find(d => d.id === doctorId);
    if (!doctor) return;
    setChoosingBusy(doctorId);
    try {
      const body = {
        patient: {
          name: form.name.trim(),
          age: Number(form.age),
          mobile: form.mobile.trim(),
          bodyTemperature: form.temp ? Number(form.temp) : undefined,
          temperatureUnit: form.unit,
          weightKg: form.weight ? Number(form.weight) : undefined,
        },
        doctorId,
        departmentId: doctor.departmentId ?? effectiveDept.toLowerCase().replaceAll(" ", "-"),
        complaint: form.remark.trim(),
        complaintCategory: "general" as const,
      };
      const result = await callApi("/api/visits", body) as { token: string };
      setToken(result.token);
      notify(`Token ${result.token} assigned to ${doctor.room} (${doctor.name}).`, "success");
      // Auto-switch to queue view after a short delay
      setTimeout(() => setView("queue"), 1200);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create visit.", "error");
    } finally {
      setChoosingBusy("");
    }
  };

  const tempDisplay = () => {
    if (!form.temp) return "";
    const t = Number(form.temp);
    if (form.unit === "F") return `${t}°F = ${((t - 32) * 5 / 9).toFixed(1)}°C`;
    return `${t}°C = ${(t * 9 / 5 + 32).toFixed(1)}°F`;
  };

  // ───── Queue List View ─────
  if (view === "queue") {
    return (
      <>
        <div className="page-header">
          <div className="page-header-left">
            <div className="page-eyebrow">Reception{receptionDept ? ` · ${receptionDept}` : ""}</div>
            <h1 className="page-title">Patient Queue</h1>
            <p className="page-subtitle">{queueVisits.length} patient{queueVisits.length !== 1 ? "s" : ""} currently in queue</p>
          </div>
          <button className="btn btn-primary" onClick={() => { handleReset(); setView("register"); }}>+ Add New Patient</button>
        </div>

        {queueVisits.length === 0 ? (
          <div className="no-patient-card">
            <div className="no-patient-icon">📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Patients in Queue</div>
            <p style={{ color: "var(--muted)", marginBottom: 16 }}>
              Click &ldquo;+ Add New Patient&rdquo; above to register a new patient.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queueVisits.map(v => {
              const doc = state.doctors.find(d => d.id === v.doctorId);
              return (
                <div key={v.id} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div className="patient-avatar-lg" style={{ width: 42, height: 42, fontSize: 16, flexShrink: 0 }}>
                    {String(v.patientName ?? "P").slice(0, 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{v.patientName}</span>
                      <span className="badge badge-blue" style={{ fontSize: 11 }}>{v.token}</span>
                      <span className={`badge ${v.status === "waiting" ? "badge-amber" : "badge-green"}`} style={{ fontSize: 11 }}>
                        {v.status === "waiting" ? "⏳ Waiting" : "🩺 In Consultation"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      Age: {v.age} · {v.mobile ?? "—"} · {doc?.room ?? "—"} ({doc?.name ?? "Unassigned"})
                    </div>
                    {v.complaint && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        💬 {v.complaint}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Department Referrals */}
        {referrals.filter(r => String(r.status) === "pending_allocation").length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="section-title">↩ Incoming Referrals</div>
            {referrals.filter(r => String(r.status) === "pending_allocation").map(ref => (
              <div key={ref.id} className="referral-card" style={{ marginBottom: 10 }}>
                <div className="referral-card-info">
                  <div className="referral-card-name">{String(ref.patientName)}</div>
                  <div className="referral-card-meta">From {String(ref.referringDoctorName)} → {String(ref.department)}</div>
                  <div className="referral-card-meta">{String(ref.complaintText ?? "Follow-up")}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {state.doctors.filter(d => d.department === String(ref.department) && d.status !== "paused").map(doc => (
                    <button key={doc.id} className="btn btn-secondary btn-sm" onClick={() => {
                      void run(callApi, notify, "allocate-referral", { referralId: ref.id, doctorId: doc.id }, `Referral allocated to ${doc.room}.`);
                    }}>
                      {doc.room} · {doc.name}
                    </button>
                  ))}
                  {state.doctors.filter(d => d.department === String(ref.department)).length === 0 && (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>No doctor for {String(ref.department)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ───── Register Patient View ─────
  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Reception{receptionDept ? ` · ${receptionDept}` : ""}</div>
          <h1 className="page-title">Register Patient</h1>
          <p className="page-subtitle">Select department, fill details, save — then assign to a room.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {token && (
            <button className="btn btn-secondary" onClick={() => { handleReset(); }}>+ New Patient</button>
          )}
          <button className="btn btn-secondary" onClick={() => setView("queue")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            📋 Queue <span className="badge badge-blue" style={{ fontSize: 11 }}>{queueVisits.length}</span>
          </button>
        </div>
      </div>

      <div className="reception-layout">
        {/* Left: Form */}
        <div className="card reception-form-card">
          <div className="reception-form-title">📋 Patient Details</div>

          {token ? (
            <>
              <div className="token-confirm">
                <div className="token-confirm-icon">🎫</div>
                <div className="token-confirm-text">
                  <div className="token-confirm-label">Token Issued</div>
                  <div className="token-confirm-value">{token}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
                Patient assigned to <strong>{effectiveDept}</strong>. Click &ldquo;+ New Patient&rdquo; to register another or &ldquo;📋 Queue&rdquo; to view all patients.
              </div>
            </>
          ) : (
            <div className="reception-form">
              {/* Department selector — only show if receptionist has no fixed dept */}
              {!receptionDept && (
                <div className="form-field">
                  <label className="form-label">Department / Speciality *</label>
                  <select
                    className="form-select"
                    value={selectedDept}
                    onChange={e => { setSelectedDept(e.target.value); setSaved(false); setToken(""); }}
                    disabled={saved}
                  >
                    <option value="">— Select department —</option>
                    {DEPT_LIST.map(d => (
                      <option key={d.key} value={d.key}>{d.icon} {d.label}</option>
                    ))}
                  </select>
                  {selectedDept && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {DEPT_LIST.find(d => d.key === selectedDept)?.desc}
                    </div>
                  )}
                </div>
              )}

              <div className="form-field">
                <label className="form-label">Patient Name *</label>
                <input className="form-input" value={form.name} onChange={e => ch("name", e.target.value)} placeholder="Full name" disabled={saved} />
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label className="form-label">Age *</label>
                  <input className="form-input" type="number" min="0" max="130" value={form.age} onChange={e => ch("age", e.target.value)} placeholder="Years" disabled={saved} />
                </div>
                <div className="form-field">
                  <label className="form-label">Phone Number *</label>
                  <input className="form-input" value={form.mobile} onChange={e => ch("mobile", e.target.value)} placeholder="+91 XXXXX XXXXX" disabled={saved} />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Body Temperature</label>
                <div className="temp-group">
                  <input
                    className="temp-input"
                    type="number"
                    value={form.temp}
                    onChange={e => ch("temp", e.target.value)}
                    placeholder={form.unit === "F" ? "e.g. 98.6" : "e.g. 37.0"}
                    disabled={saved}
                  />
                  <div className="temp-toggle">
                    <button className={`temp-toggle-btn ${form.unit === "F" ? "active" : ""}`} onClick={() => ch("unit", "F")} disabled={saved}>°F</button>
                    <button className={`temp-toggle-btn ${form.unit === "C" ? "active" : ""}`} onClick={() => ch("unit", "C")} disabled={saved}>°C</button>
                  </div>
                </div>
                {form.temp && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{tempDisplay()}</div>}
              </div>

              <div className="form-field">
                <label className="form-label">Weight (kg)</label>
                <input className="form-input" type="number" value={form.weight} onChange={e => ch("weight", e.target.value)} placeholder="e.g. 68" disabled={saved} />
              </div>

              <div className="form-field">
                <label className="form-label">Patient Problem / Remark *</label>
                <textarea className="form-input form-textarea" value={form.remark} onChange={e => ch("remark", e.target.value)} placeholder="Describe the chief complaint in detail…" disabled={saved} />
              </div>

              {!saved && (
                <button className="btn btn-primary btn-full btn-lg" onClick={handleSave} disabled={saveBusy}>
                  {saveBusy ? <><span className="btn-spinner" /> Saving…</> : "Save & Choose Room →"}
                </button>
              )}

              {saved && !token && (
                <div style={{ background: "var(--green-bg)", border: "1px solid rgba(22,121,79,0.2)", borderRadius: "var(--radius-sm)", padding: "12px 14px", fontSize: 13, color: "var(--green)", fontWeight: 600 }}>
                  ✅ Details saved — select a room on the right.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Room Picker */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              {saved && !token ? "🏥 Choose a Room" : "🏥 Available Rooms"}
            </div>
            {effectiveDept && (
              <span className="badge badge-blue">{DEPT_LIST.find(d => d.key === effectiveDept)?.icon} {effectiveDept}</span>
            )}
          </div>

          {!saved && !token ? (
            <div className="rooms-placeholder">
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>🏥</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {!effectiveDept ? "Select a department first" : "Fill in details & save"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {!effectiveDept
                  ? "Choose the department this patient needs from the form"
                  : `Complete the patient form and click "Save & Choose Room"`}
              </div>
            </div>
          ) : (
            <div className="rooms-section">
              {filteredDoctors.length === 0 ? (
                /* No doctors configured for this department */
                <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.35 }}>🩺</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "var(--ink)" }}>No Doctor Available</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                    No doctor is currently configured for <strong>{effectiveDept}</strong>.
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Available departments with doctors:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 10 }}>
                    {[...new Set(state.doctors.map(d => d.department))].map(dept => (
                      <span key={dept} className="badge badge-green">{dept}</span>
                    ))}
                  </div>
                </div>
              ) : (
                filteredDoctors.map(doc => {
                  const waiting = waitingFor(state, doc.id).length;
                  const current = state.visits.find(v => v.id === doc.currentVisitId);
                  const isBreak = doc.status === "paused";
                  // Disable if: on break, already busy choosing, or token already assigned (prevents duplicate)
                  const isDisabled = isBreak || !!choosingBusy || !!token;
                  return (
                    <button
                      key={doc.id}
                      className={`room-card ${isBreak ? "room-card-break" : ""} ${token ? "room-card-done" : ""}`}
                      onClick={() => !isDisabled && void choose(doc.id)}
                      disabled={isDisabled}
                      style={{ width: "100%", textAlign: "left", marginBottom: 10, opacity: token ? 0.6 : 1 }}
                    >
                      <div className="room-card-avatar">{doc.name.slice(0, 1).toUpperCase()}</div>
                      <div className="room-card-info">
                        <div className="room-card-name">
                          {doc.room} · {doc.name}
                          {isBreak && <span className="badge badge-amber">On Break</span>}
                          {doc.status === "busy" && <span className="badge badge-blue">Busy</span>}
                          {doc.status === "available" && <span className="badge badge-green">Available</span>}
                        </div>
                        <div className="room-card-dept">{doc.department}</div>
                        <div className="room-card-stats">
                          <div className="room-stat">
                            <div className="room-stat-value">{waiting}</div>
                            <div className="room-stat-label">Waiting</div>
                          </div>
                          <div className="room-stat-divider" />
                          <div className="room-stat">
                            <div className="room-stat-value">{current?.token ?? "—"}</div>
                            <div className="room-stat-label">Current</div>
                          </div>
                          <div className="room-stat-divider" />
                          <div className="room-stat">
                            <div className="room-stat-value">{waiting + (current ? 1 : 0)}</div>
                            <div className="room-stat-label">Assigned</div>
                          </div>
                        </div>
                      </div>
                      {!isBreak && !token && (
                        <div className="room-card-arrow">
                          {choosingBusy === doc.id ? <span className="btn-spinner dark" /> : "→"}
                        </div>
                      )}
                      {token && (
                        <div className="room-card-arrow" style={{ color: "var(--green)" }}>✓</div>
                      )}
                    </button>
                  );
                })
              )}

              {/* Show all other departments as "No doctor" info */}
              {filteredDoctors.length > 0 && effectiveDept && (
                <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--surface)", border: "1px dashed var(--line)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--muted)" }}>
                  Showing doctors for <strong>{effectiveDept}</strong> only.
                  Other departments may not have doctors assigned yet.
                </div>
              )}
            </div>
          )}

          {/* Department Referrals */}
          {referrals.filter(r => String(r.status) === "pending_allocation").length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="section-title">↩ Incoming Referrals</div>
              {referrals.filter(r => String(r.status) === "pending_allocation").map(ref => (
                <div key={ref.id} className="referral-card" style={{ marginBottom: 10 }}>
                  <div className="referral-card-info">
                    <div className="referral-card-name">{String(ref.patientName)}</div>
                    <div className="referral-card-meta">From {String(ref.referringDoctorName)} → {String(ref.department)}</div>
                    <div className="referral-card-meta">{String(ref.complaintText ?? "Follow-up")}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {state.doctors.filter(d => d.department === String(ref.department) && d.status !== "paused").map(doc => (
                      <button key={doc.id} className="btn btn-secondary btn-sm" onClick={() => {
                        void run(callApi, notify, "allocate-referral", { referralId: ref.id, doctorId: doc.id }, `Referral allocated to ${doc.room}.`);
                      }}>
                        {doc.room} · {doc.name}
                      </button>
                    ))}
                    {state.doctors.filter(d => d.department === String(ref.department)).length === 0 && (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>No doctor for {String(ref.department)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════
   DOCTOR LIVE
   ════════════════════════════════════════════════ */
type MedItem = {
  id: string; medicineId: string; name: string;
  dosage: string; timing: string; frequency: string;
  duration: string; quantity: string;
};

export function DoctorLive({ state, doctorId, callApi, notify }: {
  state: QueueState; doctorId?: string; callApi: Call; notify: NotifyFn;
}) {
  const doctor = state.doctors.find(d => d.id === doctorId);
  const patient = state.visits.find(v => v.id === doctor?.currentVisitId)
    ?? (doctor ? waitingFor(state, doctor.id)[0] : undefined);

  const [started, setStarted] = useState(false);
  const [remark, setRemark] = useState("");
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [items, setItems] = useState<MedItem[]>([]);
  const [referrals, setReferrals] = useState<string[]>([]);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch medicines from Firestore (fall back to static list)
  const fsRows = useRows("medicines");
  const medicines = fsRows.length > 0 ? fsRows : MEDICINES_STATIC;

  useEffect(() => { setStarted(false); setRemark(""); setItems([]); setReferrals([]); setSearch(""); }, [patient?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!doctor) {
    return (
      <div className="no-patient-card">
        <div className="no-patient-icon">🩺</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Profile Pending Approval</div>
        <p style={{ color: "var(--muted)" }}>Your doctor profile is awaiting admin approval or room assignment.</p>
      </div>
    );
  }

  const isBreak = doctor.status === "paused";

  const handleToggle = async () => {
    setToggleBusy(true);
    await run(callApi, notify, "pause", { doctorId: doctor.id, paused: !isBreak },
      isBreak ? "Status set to Working." : "Status set to Break.");
    setToggleBusy(false);
  };

  const handleStart = async () => {
    if (!patient) return;
    setStartBusy(true);
    const result = await run(callApi, notify, "start", { visitId: patient.id, doctorId: doctor.id }, "Consultation started.");
    if (result) setStarted(true);
    setStartBusy(false);
  };

  const addMed = (med: Row) => {
    setItems(curr => curr.some(i => i.medicineId === med.id) ? curr : [
      ...curr,
      { id: String(med.id), medicineId: String(med.id), name: String(med.name), dosage: "", timing: "", frequency: "", duration: "", quantity: "1" },
    ]);
    setSearch(""); setShowDropdown(false);
  };

  const updateItem = (index: number, field: keyof MedItem, value: string) =>
    setItems(curr => curr.map((item, i) => i === index ? { ...item, [field]: value } : item));

  const removeItem = (index: number) => setItems(curr => curr.filter((_, i) => i !== index));

  const visibleMeds = medicines.filter(m => String(m.name).toLowerCase().includes(search.toLowerCase()));

  const handleGenerate = async () => {
    if (!patient) return;
    if (items.length === 0) return notify("Add at least one medicine before generating prescription.", "error");
    for (const item of items) {
      if (!item.dosage.trim()) return notify(`Enter dosage for ${item.name}.`, "error");
      if (!item.timing) return notify(`Select timing for ${item.name}.`, "error");
      if (!item.frequency.trim()) return notify(`Enter frequency for ${item.name}.`, "error");
      if (!item.duration.trim()) return notify(`Enter duration for ${item.name}.`, "error");
    }
    setGenBusy(true);
    const payload = {
      visitId: patient.id,
      doctorId: doctor.id,
      notes: remark,
      referrals: referrals.filter(Boolean),
      items: items.map(i => ({
        medicineId: i.medicineId,
        name: i.name,
        dosage: i.dosage,
        timing: i.timing,
        frequency: i.frequency,
        duration: i.duration,
        quantity: Number(i.quantity) || 1,
      })),
    };
    const result = await run(callApi, notify, "prescription", payload, "Prescription generated and sent to Pharmacy.");
    if (result) {
      // Open in a new tab for native Print to PDF
      const prescriptionHTML = generatePrescriptionHTML({ patient, doctor, remark, items, referrals });
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(prescriptionHTML);
        printWindow.document.close();
      } else {
        notify("Please allow popups to print the prescription.", "error");
      }
      await run(callApi, notify, "complete", { visitId: patient.id, doctorId: doctor.id }, "Consultation completed.");
      setStarted(false);
    }
    setGenBusy(false);
  };

  // Determine if the consultation is currently active
  const isConsulting = started || patient?.status === "in_consultation";

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Doctor Portal</div>
          <h1 className="page-title">Dr. {doctor.name}</h1>
          <p className="page-subtitle">{doctor.department} · {doctor.room}</p>
        </div>
        <button
          className={`doctor-status-toggle ${isBreak ? "on-break" : ""}`}
          onClick={handleToggle}
          disabled={toggleBusy}
        >
          {toggleBusy ? <span className="btn-spinner dark" /> : null}
          <span className={`status-pill ${isBreak ? "break" : "working"}`}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            {isBreak ? "On Break" : "Working"}
          </span>
          {isBreak ? "Resume Working" : "Take Break"}
        </button>
      </div>

      {/* Content */}
      {!patient ? (
        <div className="no-patient-card">
          <div className="no-patient-icon">⏳</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Patients in Queue</div>
          <p style={{ color: "var(--muted)" }}>
            {isBreak ? "You are on break. Resume working to accept patients." : "Waiting for the next patient to be assigned."}
          </p>
        </div>
      ) : !isConsulting ? (
        /* Patient overview — before diagnosis */
        <div className="patient-overview">
          <div className="patient-overview-header">
            <div className="patient-avatar-lg">{String(patient.patientName ?? "P").slice(0, 1)}</div>
            <div className="patient-overview-info">
              <div className="patient-name-lg">{patient.patientName} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 400 }}>· Token {patient.token}</span></div>
              <div className="patient-meta-row">
                <span className="patient-meta-item">🎂 {patient.age} years</span>
                <span className="patient-meta-item">📱 {patient.mobile ?? "—"}</span>
                {patient.bodyTemperature && (
                  <span className="patient-meta-item">🌡️ {patient.bodyTemperature}°{patient.temperatureUnit ?? "F"}</span>
                )}
                {patient.weightKg && (
                  <span className="patient-meta-item">⚖️ {patient.weightKg} kg</span>
                )}
              </div>
            </div>
          </div>

          {/* Vitals */}
          <div className="vitals-grid">
            <div className="vital-card">
              <div className="vital-value">{patient.age}</div>
              <div className="vital-unit">Age (years)</div>
            </div>
            <div className="vital-card">
              <div className="vital-value">{patient.bodyTemperature ?? "—"}</div>
              <div className="vital-unit">Temp °{patient.temperatureUnit ?? "F"}</div>
            </div>
            <div className="vital-card">
              <div className="vital-value">{patient.weightKg ?? "—"}</div>
              <div className="vital-unit">Weight (kg)</div>
            </div>
            <div className="vital-card">
              <div className="vital-value">{patient.token}</div>
              <div className="vital-unit">Token</div>
            </div>
          </div>

          <div className="complaint-box">
            <div className="complaint-label">Chief Complaint</div>
            <div className="complaint-text">{patient.complaint}</div>
          </div>

          <button className="btn btn-primary btn-lg btn-full" onClick={handleStart} disabled={startBusy || isBreak}>
            {startBusy ? <><span className="btn-spinner" /> Starting…</> : "Start Diagnosis →"}
          </button>
        </div>
      ) : (
        /* Diagnosis mode */
        <div className="diagnosis-layout">
          {/* Patient info – compact sidebar */}
          <div className="patient-mini-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div className="patient-avatar-lg" style={{ width: 38, height: 38, fontSize: 14 }}>{String(patient.patientName ?? "P").slice(0, 1)}</div>
              <div className="patient-mini-name">{patient.patientName}</div>
            </div>
            <div className="patient-mini-meta">
              Token: <strong>{patient.token}</strong><br />
              Age: <strong>{patient.age} yrs</strong><br />
              Phone: <strong>{patient.mobile ?? "—"}</strong><br />
              Temp: <strong>{patient.bodyTemperature ?? "—"}°{patient.temperatureUnit ?? "F"}</strong><br />
              Weight: <strong>{patient.weightKg ?? "—"} kg</strong>
            </div>
            <div className="patient-mini-complaint">
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>Complaint</div>
              {patient.complaint}
            </div>
          </div>

          {/* Prescription builder */}
          <div className="prescription-card">
            {/* Remark */}
            <div className="prescription-section">
              <div className="prescription-section-title">📝 Post-Checkup Remark</div>
              <textarea
                className="form-input form-textarea"
                value={remark}
                onChange={e => setRemark(e.target.value)}
                placeholder="Doctor's clinical remark after examination…"
                style={{ minHeight: 90 }}
              />
            </div>

            {/* Medicine Search + Table */}
            <div className="prescription-section">
              <div className="prescription-section-title">💊 Medicines</div>

              <div className="med-search-wrapper" ref={searchRef}>
                <span className="med-search-icon">🔍</span>
                <input
                  className="med-search-input"
                  value={search}
                  placeholder="Search medicine to add…"
                  onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  autoComplete="off"
                />
                {showDropdown && search.length > 0 && (
                  <div className="med-dropdown">
                    {visibleMeds.length === 0 ? (
                      <div style={{ padding: "12px 14px", color: "var(--muted)", fontSize: 13 }}>No medicines found.</div>
                    ) : visibleMeds.map(med => (
                      <div
                        key={String(med.id)}
                        className="med-dropdown-item"
                        onMouseDown={e => { e.preventDefault(); addMed(med); }}
                      >
                        <span className="med-dropdown-name">{String(med.name)}</span>
                        <span className={`med-dropdown-stock badge ${String(med.stockStatus) === "available" ? "badge-green" : "badge-amber"}`}>
                          {String(med.stockStatus).replace("_", " ")}
                        </span>
                        <span style={{ fontSize: 14, color: "var(--blue)" }}>＋</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="med-table-wrapper">
                  <table className="med-table">
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Per Dose</th>
                        <th>When to Take</th>
                        <th>Frequency</th>
                        <th>Days</th>
                        <th>Qty</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600, color: "var(--ink)", minWidth: 140 }}>{item.name}</td>
                          <td>
                            <select
                              value={item.dosage}
                              onChange={e => updateItem(idx, "dosage", e.target.value)}
                              style={{ minWidth: 100 }}
                            >
                              <option value="">Select…</option>
                              <option value="½ tablet">½ tablet</option>
                              <option value="1 tablet">1 tablet</option>
                              <option value="2 tablets">2 tablets</option>
                              <option value="1 capsule">1 capsule</option>
                              <option value="2 capsules">2 capsules</option>
                              <option value="5 ml">5 ml</option>
                              <option value="10 ml">10 ml</option>
                              <option value="1 puff">1 puff</option>
                              <option value="2 puffs">2 puffs</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={item.timing}
                              onChange={e => updateItem(idx, "timing", e.target.value)}
                              style={{ minWidth: 110 }}
                            >
                              <option value="">Select…</option>
                              <option>Before food</option>
                              <option>After food</option>
                              <option>With food</option>
                              <option>At bedtime</option>
                              <option>Empty stomach</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={item.frequency}
                              onChange={e => updateItem(idx, "frequency", e.target.value)}
                              style={{ minWidth: 110 }}
                            >
                              <option value="">Select…</option>
                              <option>Once daily</option>
                              <option>Twice daily</option>
                              <option>Thrice daily</option>
                              <option>Every 8 hours</option>
                              <option>Every 6 hours</option>
                              <option>As needed</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={item.duration}
                              onChange={e => updateItem(idx, "duration", e.target.value)}
                              placeholder="Days"
                              style={{ width: 60 }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => updateItem(idx, "quantity", e.target.value)}
                              placeholder="Qty"
                              style={{ width: 60 }}
                            />
                          </td>
                          <td>
                            <button className="med-table-remove" onClick={() => removeItem(idx)} title="Remove">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {items.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: 13 }}>
                  Search and add medicines above.
                </div>
              )}
            </div>

            {/* Referrals */}
            <div className="prescription-section">
              <div className="prescription-section-title">↗ Department Referrals</div>
              {referrals.map((ref, idx) => (
                <div key={idx} className="referral-row">
                  <select
                    value={ref}
                    onChange={e => setReferrals(curr => curr.map((r, i) => i === idx ? e.target.value : r))}
                    className="form-select"
                  >
                    <option value="">Choose department…</option>
                    {DEPARTMENTS.filter(d => d !== doctor.department).map(d => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  <button className="referral-row-remove" onClick={() => setReferrals(curr => curr.filter((_, i) => i !== idx))}>✕</button>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setReferrals(curr => [...curr, ""])}>
                ＋ Add Referral
              </button>
            </div>

            {/* Generate */}
            <button
              className="btn btn-primary btn-full btn-lg"
              disabled={genBusy}
              onClick={handleGenerate}
            >
              {genBusy ? <><span className="btn-spinner" /> Generating…</> : "📄 Generate & Download Prescription"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════
   PHARMACY LIVE
   ════════════════════════════════════════════════ */
export function PharmacyLive({ callApi, notify }: { callApi: Call; notify: NotifyFn }) {
  const orders = useRows("pharmacyOrders");
  const [busy, setBusy] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const activeOrders = orders.filter(o => String(o.status) !== "dispensed");
  const completedOrders = orders.filter(o => String(o.status) === "dispensed");

  const updateStatus = async (orderId: string, status: string) => {
    setBusy(orderId + status);
    await run(callApi, notify, "pharmacy-status", { orderId, status }, `Order status updated to "${status}".`);
    setBusy("");
  };

  const generateBill = async (order: Row) => {
    const key = order.id + "bill";
    setBusy(key);
    const result = await run(callApi, notify, "billing", { orderId: order.id, billingStatus: "paid" }, "Bill generated and recorded.");
    if (result) {
      const items = Array.isArray(order.items) ? order.items as Row[] : [];
      const billHTML = generateBillHTML({ order, items });
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(billHTML);
        printWindow.document.close();
      } else {
        notify("Please allow popups to print the bill.", "error");
      }
    }
    setBusy("");
  };

  const getStep = (status: string) => {
    const steps = ["received", "preparing", "ready", "dispensed"];
    return steps.indexOf(status);
  };

  const renderOrder = (order: Row) => {
    const items = Array.isArray(order.items) ? order.items as Row[] : [];
    const step = getStep(String(order.status));
    const steps = ["Received", "Preparing", "Ready", "Dispensed"];
    const isDone = String(order.status) === "dispensed";

    return (
      <div key={order.id} className="pharmacy-order" style={isDone ? { opacity: 0.65 } : {}}>
        <div className="pharmacy-order-header">
          <div className="pharmacy-token">{String(order.token ?? "—")}</div>
          <div className="pharmacy-order-patient">
            <div className="pharmacy-patient-name">{String(order.patientName ?? "Patient")}</div>
            <div className="pharmacy-patient-meta">
              Dr. {String(order.doctorName ?? "—")}
              {Array.isArray(order.referrals) && order.referrals.length > 0
                ? ` · Referrals: ${order.referrals.join(", ")}` : ""}
            </div>
          </div>
          {!isDone && (
            <div className="pharmacy-order-actions">
              <button
                className="btn btn-secondary btn-sm"
                disabled={step >= 1 || busy === order.id + "preparing"}
                onClick={() => void updateStatus(order.id, "preparing")}
              >
                {busy === order.id + "preparing" ? <span className="btn-spinner dark" /> : null} Prepare
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={step !== 1 || busy === order.id + "ready"}
                onClick={() => void updateStatus(order.id, "ready")}
              >
                {busy === order.id + "ready" ? <span className="btn-spinner dark" /> : null} Ready
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={String(order.billingStatus) === "paid" || busy === order.id + "bill"}
                onClick={() => void generateBill(order)}
              >
                {busy === order.id + "bill" ? <span className="btn-spinner" /> : null}
                {String(order.billingStatus) === "paid" ? "✅ Billed" : "Generate Bill"}
              </button>
              <button
                className="btn btn-success btn-sm"
                disabled={step !== 2 || busy === order.id + "dispensed"}
                onClick={() => void updateStatus(order.id, "dispensed")}
              >
                {busy === order.id + "dispensed" ? <span className="btn-spinner dark" /> : null} Dispense
              </button>
            </div>
          )}
          {isDone && (
            <span className="badge badge-green" style={{ fontSize: 12 }}>✅ Dispensed</span>
          )}
        </div>

        <div className="pharmacy-order-body">
          {/* Medicine Table */}
          {items.length > 0 ? (
            <table className="pharmacy-med-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Per Dose</th>
                  <th>When to Take</th>
                  <th>Frequency</th>
                  <th>Days</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{String(item.name ?? "—")}</td>
                    <td>{String(item.dosage ?? "—")}</td>
                    <td>{String(item.timing ?? "—")}</td>
                    <td>{String(item.frequency ?? "—")}</td>
                    <td>{String(item.duration ?? "—")} days</td>
                    <td>{String(item.quantity ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>No medicine items.</p>
          )}

          {/* Progress Steps */}
          <div className="order-progress">
            {steps.map((s, i) => (
              <div key={s} className={`progress-step ${i < step ? "done" : i === step ? "current" : ""}`}>
                <div className="progress-step-dot">
                  {i < step ? "✓" : i + 1}
                </div>
                <div className="progress-step-label">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">Pharmacy</div>
          <h1 className="page-title">Prescription Orders & Bills</h1>
          <p className="page-subtitle">
            {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
            {completedOrders.length > 0 ? ` · ${completedOrders.length} completed` : ""}
          </p>
        </div>
      </div>

      {/* Active Orders */}
      {activeOrders.length === 0 && completedOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💊</div>
          <div className="empty-state-title">No Orders Yet</div>
          <div className="empty-state-desc">Prescriptions generated by doctors will appear here automatically.</div>
        </div>
      ) : (
        <>
          {activeOrders.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 20 }}>
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">All Caught Up!</div>
              <div className="empty-state-desc">No active orders right now. New prescriptions will appear automatically.</div>
            </div>
          ) : (
            activeOrders.map(renderOrder)
          )}

          {/* Completed Orders (collapsible) */}
          {completedOrders.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowCompleted(c => !c)}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
              >
                {showCompleted ? "▼" : "▶"} Completed Orders
                <span className="badge badge-green" style={{ fontSize: 11 }}>{completedOrders.length}</span>
              </button>
              {showCompleted && completedOrders.map(renderOrder)}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════
   HTML GENERATION HELPERS
   ════════════════════════════════════════════════ */

function generatePrescriptionHTML({ patient, doctor, remark, items, referrals }: {
  patient: QueueState["visits"][0];
  doctor: QueueState["doctors"][0];
  remark: string;
  items: MedItem[];
  referrals: string[];
}): string {
  const rows = items.map(item =>
    `<tr>
      <td><strong>${item.name}</strong></td>
      <td>${item.dosage}</td>
      <td>${item.timing}</td>
      <td>${item.frequency}</td>
      <td>${item.duration} days</td>
      <td>${item.quantity}</td>
    </tr>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clinicify Prescription – ${patient.token}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: #2563eb;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --bg-light: #f8fafc;
  }
  body { 
    font-family: 'Inter', sans-serif; 
    font-size: 14px; 
    color: var(--text-main); 
    padding: 0; 
    margin: 0;
    background: #fff;
  }
  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--primary); padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
  .brand span { color: var(--primary); }
  .brand-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border-radius: 6px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .rx { font-size: 48px; font-weight: 700; color: var(--primary); line-height: 1; }
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; background: var(--bg-light); padding: 20px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 24px; }
  .info-group { display: flex; flex-direction: column; gap: 4px; }
  .info-label { font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px; }
  .info-value { font-weight: 600; font-size: 14px; color: var(--text-main); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { padding: 12px 16px; text-align: left; }
  th { background: var(--bg-light); font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); letter-spacing: 0.5px; }
  td { border-bottom: 1px solid var(--border); font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; }
  .remark-box { background: var(--bg-light); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-end; }
  .signature-box { text-align: center; }
  .signature-line { width: 180px; border-bottom: 1px solid var(--text-main); margin-bottom: 8px; }
  .doctor-name { font-weight: 600; font-size: 16px; }
  .doctor-meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  @media print {
    body { padding: 0; }
    .page { padding: 20px; width: 100%; max-width: 100%; box-sizing: border-box; }
    @page { margin: 1cm; size: A4 portrait; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand"><div class="brand-icon">✚</div> CLINICI<span>FY</span></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:500;">Official Medical Prescription</div>
    </div>
    <div class="rx">℞</div>
  </div>

  <div class="info-grid">
    <div class="info-group"><div class="info-label">Patient Name</div><div class="info-value">${patient.patientName}</div></div>
    <div class="info-group"><div class="info-label">Token / ID</div><div class="info-value">${patient.token}</div></div>
    <div class="info-group"><div class="info-label">Age / Sex</div><div class="info-value">${patient.age} Y / U</div></div>
    <div class="info-group"><div class="info-label">Date</div><div class="info-value">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div></div>
    <div class="info-group"><div class="info-label">Vitals</div><div class="info-value">T: ${patient.bodyTemperature ?? "—"}°${patient.temperatureUnit ?? "F"} · W: ${patient.weightKg ?? "—"} kg</div></div>
    <div class="info-group"><div class="info-label">Contact</div><div class="info-value">${patient.mobile ?? "—"}</div></div>
  </div>

  ${remark ? `<div class="section-title">Clinical Notes</div>
  <div class="remark-box">${remark}</div>` : ""}

  <div class="section-title">Rx Medicines</div>
  <table>
    <thead>
      <tr><th>Medicine</th><th>Dosage</th><th>Timing</th><th>Frequency</th><th>Duration</th><th>Qty</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${referrals.filter(Boolean).length > 0 ? `<div class="section-title">Department Referrals</div>
  <div class="remark-box">${referrals.filter(Boolean).join(", ")}</div>` : ""}

  <div class="footer">
    <div>
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Powered by Clinicify Healthcare</div>
      <div style="font-size: 12px; color: var(--text-muted);">Timestamp: ${new Date().toLocaleString()}</div>
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="doctor-name">Dr. ${doctor.name}</div>
      <div class="doctor-meta">${doctor.department} · ${doctor.room}</div>
    </div>
  </div>
</div>
<script>
  window.onload = function() {
    window.print();
  }
</script>
</body>
</html>`;
}

function generateBillHTML({ order, items }: { order: Row; items: Row[] }): string {
  const rows = items.map(item => {
    const qty = Number(item.quantity ?? 0);
    const price = Number(item.unitPrice ?? 0);
    return `<tr>
      <td><strong>${String(item.name ?? "—")}</strong><div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${String(item.dosage ?? "—")} · ${String(item.timing ?? "—")}</div></td>
      <td style="text-align:center">${qty}</td>
      <td style="text-align:right">₹${price.toFixed(2)}</td>
      <td style="text-align:right; font-weight: 600;">₹${(qty * price).toFixed(2)}</td>
    </tr>`;
  }).join("");

  const total = items.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.unitPrice ?? 0), 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clinicify Invoice – ${String(order.token)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: #10b981;
    --text-main: #0f172a;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --bg-light: #f8fafc;
  }
  body { 
    font-family: 'Inter', sans-serif; 
    font-size: 14px; 
    color: var(--text-main); 
    padding: 0; 
    margin: 0;
    background: #fff;
  }
  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px;
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--primary); padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
  .brand span { color: var(--primary); }
  .brand-icon { background: linear-gradient(135deg, #10b981, #059669); color: white; border-radius: 6px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; background: var(--bg-light); padding: 20px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 24px; }
  .info-group { display: flex; flex-direction: column; gap: 4px; }
  .info-label { font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--text-muted); letter-spacing: 0.5px; }
  .info-value { font-weight: 600; font-size: 14px; color: var(--text-main); }
  
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { padding: 14px 16px; text-align: left; }
  th { background: var(--bg-light); font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); letter-spacing: 0.5px; }
  td { border-bottom: 1px solid var(--border); font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: 700; font-size: 18px; background: #ecfdf5; border-top: 2px solid var(--primary); }
  
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); text-align: center; font-size: 13px; color: var(--text-muted); }
  .paid-stamp { display: inline-block; border: 4px solid var(--primary); border-radius: 8px; color: var(--primary); font-size: 28px; font-weight: 800; padding: 8px 32px; transform: rotate(-10deg); letter-spacing: 3px; margin: 24px 0; }
  
  @media print {
    body { padding: 0; }
    .page { padding: 20px; width: 100%; max-width: 100%; box-sizing: border-box; }
    @page { margin: 1cm; size: A4 portrait; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand"><div class="brand-icon">₹</div> CLINICI<span>FY</span></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-weight:500;">Tax Invoice / Pharmacy Receipt</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:4px;">Invoice Date</div>
      <div style="font-size:16px;font-weight:600;">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-group"><div class="info-label">Token No.</div><div class="info-value">${String(order.token ?? "—")}</div></div>
    <div class="info-group"><div class="info-label">Patient Name</div><div class="info-value">${String(order.patientName ?? "—")}</div></div>
    <div class="info-group"><div class="info-label">Prescribed By</div><div class="info-value">Dr. ${String(order.doctorName ?? "—")}</div></div>
    <div class="info-group"><div class="info-label">Payment Status</div><div class="info-value" style="color:var(--primary);">PAID</div></div>
  </div>

  <table>
    <thead>
      <tr><th>Item Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="3" style="text-align:right">Total Amount Paid</td>
        <td style="text-align:right; color: var(--primary);">₹${total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div style="text-align:center;">
    <div class="paid-stamp">SUCCESSFULLY PAID</div>
  </div>

  <div class="footer">
    <strong>Thank you for choosing Clinicify.</strong><br/>
    <span style="display:inline-block; margin-top:8px;">This is a computer-generated invoice and does not require a physical signature.</span>
  </div>
</div>
<script>
  window.onload = function() {
    window.print();
  }
</script>
</body>
</html>`;
}
