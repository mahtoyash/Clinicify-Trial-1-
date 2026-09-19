# Clinicify

Clinicify is a hackathon-ready OPD operations interface centered on a doctor-specific, live queue and ETA forecast.

## Run locally

```bash
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`.

Demo staff accounts are seeded by `npm run seed`. Their roles are assigned as Firebase custom claims; the UI cannot grant a role.

## Firebase local setup

1. Add Firebase and Resend values to `.env.local` (never commit this file or `.secrets/firebase-admin.json`).
2. Run `npm run seed` to create synthetic staff, queues, visits, and inventory.
3. In Firebase Console → Firestore Database → Rules, publish the contents of `firestore.rules`. The rule set permits authenticated staff reads only and denies direct client writes; Clinicify API routes use Firebase Admin credentials for trusted mutations.

The public patient tracking page is `http://localhost:3000/track/demo-gm-080`. New visits receive an unguessable tracking key from the server.

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
