# Clinicify

Clinicify is a hackathon-ready OPD operations interface centered on a doctor-specific, live queue and ETA forecast.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Architecture

- `app/` — Next.js application shell and global visual system.
- `components/` — reusable UI composition for reception, doctor, pharmacy, inventory, billing, admin, and patient tracking views.
- `lib/domain/` — framework-independent types and the authoritative deterministic queue/ETA engine.
- `lib/demo-data.ts` — synthetic, resettable demo data.

The priority action is deliberately demonstrated against two adjacent doctor queues: it recalculates Dr. Mehta only, while Dr. Iyer remains unchanged. The queue engine supports reforecasting source and destination queues on a transfer.

## Production integrations

The checked-in build uses synthetic in-memory data so it can run without credentials for a hackathon demo. The `.env.example` documents the Firebase and Resend configuration points. A production deployment should call the domain operations only from trusted Firebase Cloud Functions, persist to Firestore, enforce server-side roles, subscribe through Firestore realtime listeners, and invoke Resend after the queue transaction commits. Email failure must be recorded but never roll back queue state.

## Validation

```bash
npm run test
npm run lint
npm run build
```
