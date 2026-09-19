# Clinicify

Clinicify is an Intelligent OPD Flow System built with Next.js, Firebase, and real-time queues.

## Quick Setup Instructions for Local Development

To run this project on your local machine, follow these steps:

### 1. Clone the repository
```bash
git clone https://github.com/mahtoyash/Clinicify-Trial-1-.git
cd Clinicify-Trial-1-
```

### 2. Install dependencies
Make sure you have Node.js installed, then run:
```bash
npm install
```

### 3. Environment Variables (IMPORTANT)
For security reasons, API keys and credentials are not pushed to GitHub. You must configure your environment variables to connect to Firebase.

1. Copy the example environment file:
```bash
cp .env.example .env.local
```
2. Open `.env.local` and fill in your Firebase project configuration (you can get this from your Firebase Console under Project Settings -> General -> Web App).
3. If you want to connect to the exact same database as the original developer, you will need to ask them for their `.env.local` file and the `firebase-admin.json` file.

### 4. Admin Credentials (Firebase Admin SDK)
To use the backend APIs (like creating staff or verifying logins), you need a Firebase Service Account key:
1. Go to Firebase Console -> Project Settings -> Service Accounts.
2. Click "Generate new private key".
3. Save the downloaded JSON file to `.secrets/firebase-admin.json` in the root of the project (create the `.secrets` folder if it doesn't exist).

### 5. Start the Application
Run the development server:
```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000) (or whichever port Next.js assigns, e.g., 3001).

## Architecture

- `app/` — Next.js application shell, App Router API routes, and global visual system.
- `components/` — Reusable UI components (landing page, doctor workflows, reception, pharmacy, etc.).
- `lib/` — Firebase client/admin initializers and Realtime logic.

## Validation
```bash
npm run test
npm run lint
npm run build
```
