# Aptitude Payment Approval Portal

A complete, production-ready **Payment Approval Portal** that runs entirely in
the browser — no server, no PHP, no Node.js backend. Built with HTML5, CSS3,
vanilla JavaScript (ES6), Bootstrap 5, Font Awesome and Chart.js on the
frontend, and Firebase (Authentication, Firestore, Storage) as the backend.
Deployable directly to **GitHub Pages** or **Firebase Hosting**.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Folder Structure](#folder-structure)
4. [Firebase Setup](#firebase-setup)
5. [Creating the Three Portal Users](#creating-the-three-portal-users)
6. [Local Preview](#local-preview)
7. [Deploy to GitHub Pages](#deploy-to-github-pages)
8. [Deploy to Firebase Hosting](#deploy-to-firebase-hosting)
9. [How to Change the Logo](#how-to-change-the-logo)
10. [How to Add Outlets / Categories / Payment Types](#how-to-add-outlets--categories--payment-types)
11. [How to Add Suppliers](#how-to-add-suppliers)
12. [How to Back Up the Database](#how-to-back-up-the-database)
13. [Security Model](#security-model)
14. [Final Deployment Checklist](#final-deployment-checklist)

---

## Features

- Glassmorphism dark-blue corporate login page with Remember Me and Forgot Password
- Three roles: **Accounts**, **Administrator**, **Operations Manager**, each with a tailored dashboard
- New Payment Request form with full field validation, drag-and-drop attachments, Save Draft / Submit
- Approval workflow: Draft → Submitted/Pending Approval → Approved / Rejected / On Hold → Paid
- Every approval action stores approver name, role, date/time and remarks in a permanent audit trail
- Approvals screen with tabs (Pending / Held / Approved / Rejected), remarks-required modals
- Payment Details page with timeline, attachments, Print and Download PDF
- Reports & Analytics: filters (daily/weekly/monthly/quarterly/yearly/custom), 6 charts, Top Suppliers, Supplier Profile modal
- Global search, sortable/filterable/paginated History table
- PDF export (jsPDF + autotable, with QR code) and Excel/CSV export (SheetJS)
- Notification bell with unread counter, real-time via Firestore
- Settings page (Admin): company profile, outlets, categories, payment types, suppliers, user overview
- Fully responsive: desktop, tablet, mobile
- Toasts, spinners, skeleton loaders throughout
- Firestore & Storage security rules enforcing role-based access

---

## Tech Stack

| Layer          | Technology                                    |
|----------------|------------------------------------------------|
| UI             | HTML5, CSS3, Bootstrap 5, Font Awesome 6       |
| Logic          | Vanilla JavaScript (ES6)                       |
| Charts         | Chart.js 4                                     |
| Auth/Database  | Firebase Authentication + Firestore             |
| File storage   | Firebase Storage                                |
| PDF export     | jsPDF + jspdf-autotable                         |
| Excel export   | SheetJS (xlsx)                                  |
| Hosting        | GitHub Pages (or Firebase Hosting)              |

No build step, no bundler, no npm install required to run the app — every
library is loaded via CDN `<script>` tags, so it works as static files on
GitHub Pages.

---

## Folder Structure

```
aptitude-payment-portal/
├── index.html                # Redirects to login.html or dashboard.html
├── login.html
├── dashboard.html
├── new-payment.html
├── approval.html
├── history.html
├── payment-details.html
├── reports.html
├── settings.html
├── profile.html
├── css/
│   └── style.css
├── js/
│   ├── firebase/
│   │   └── firebase-config.js
│   ├── app.js                # Shared shell, auth guard, toasts, helpers
│   ├── auth.js                # Login page logic
│   ├── dashboard.js
│   ├── new-payment.js
│   ├── approval.js
│   ├── history.js
│   ├── payment-details.js
│   ├── reports.js
│   ├── settings.js
│   ├── profile.js
│   ├── pdf-export.js
│   └── excel-export.js
├── assets/
│   ├── images/
│   │   ├── logo.svg
│   │   └── favicon.svg
│   ├── icons/
│   └── pdf/
├── .github/workflows/deploy.yml   # Auto-deploy to GitHub Pages
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── .gitignore
├── LICENSE
└── README.md
```

---

## Firebase Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g. `aptitude-payment-portal`).
2. **Add a Web App**: Project Settings → General → "Your apps" → Web (`</>`) icon. Copy the generated config object.
3. Open `js/firebase/firebase-config.js` in this project and replace the placeholder values:

   ```js
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

4. **Enable Authentication**: Build → Authentication → Get Started → Sign-in method → enable **Email/Password**.
5. **Enable Firestore**: Build → Firestore Database → Create database → Start in **production mode** → choose a region.
6. **Enable Storage**: Build → Storage → Get Started → keep default bucket → production mode.
7. Deploy the security rules (see [Deploy to Firebase Hosting](#deploy-to-firebase-hosting) for the CLI commands), or paste the contents of `firestore.rules` and `storage.rules` directly into the Console's Rules tab for each product and click **Publish**.

---

## Creating the Three Portal Users

The portal recognizes exactly three accounts, matched by email address (see
`ROLE_MAP` in `js/firebase/firebase-config.js`):

| Email                     | Role               |
|---------------------------|--------------------|
| accounts@aptitude.ae      | Accounts           |
| admin@aptitude.ae         | Administrator      |
| operations@aptitude.ae    | Operations Manager |

To create them:

1. Firebase Console → Authentication → Users → **Add user**.
2. Enter each email above with a strong temporary password.
3. Share the credentials with the relevant team member. They can change their password anytime from **My Profile** inside the portal, or you can send a password-reset email from the Authentication console.

> Want to add more users or different emails? Simply add more entries to the
> `ROLE_MAP` object in `js/firebase/firebase-config.js` and update
> `firestore.rules` / `storage.rules` with matching role-check functions.

---

## Local Preview

Because this is a static site, you can preview it with any simple HTTP
server (opening `index.html` directly via `file://` will block Firebase
requests in some browsers):

```bash
# Python 3
python3 -m http.server 8080

# Node.js (if installed)
npx serve .
```

Then visit `http://localhost:8080`.

---

## Deploy to GitHub Pages

**Option A — Automatic (recommended):** the included workflow
`.github/workflows/deploy.yml` deploys automatically on every push to `main`.

1. Create a new GitHub repository and push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Aptitude Payment Approval Portal"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In your repository: **Settings → Pages → Build and deployment → Source** → select **GitHub Actions**.
3. Push to `main` (or re-run the workflow from the **Actions** tab). Your site will be published at:
   ```
   https://<your-username>.github.io/<your-repo>/
   ```

**Option B — Manual (classic branch deploy):**

1. Settings → Pages → Source → **Deploy from a branch** → Branch: `main`, Folder: `/ (root)` → Save.
2. GitHub will publish the same URL as above within a minute or two.

All links in this project use **relative paths**, so it works correctly
whether hosted at a root domain or under a repository subpath.

---

## Deploy to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting        # choose "Use an existing project", public dir "."
firebase deploy --only hosting,firestore:rules,storage:rules
```

Your site will be published at `https://<your-project-id>.web.app`.

---

## How to Change the Logo

1. Replace `assets/images/logo.svg` and `assets/images/favicon.svg` with your own files (keep the same filenames, or update the `<link rel="icon">` tags in every HTML page).
2. Optionally set a hosted logo URL in **Settings → General → Company Logo URL** — this value is stored in Firestore (`settings/general.logoURL`) for use in custom branding if you extend the PDF export or topbar.

---

## How to Add Outlets / Categories / Payment Types

1. Log in as **Administrator**.
2. Go to **Settings → Outlets / Categories / Payment Types** tab.
3. Type a new value into the relevant box and click the **+** button. Click the **×** on a chip to remove it.
4. Click **Save Settings** on the General tab to persist changes (list changes and general settings are saved together to `settings/general` in Firestore).

> Note: The New Payment Request form currently ships with a fixed starter
> list of outlets/categories/payment types for reliability. To make the form
> read dynamically from Firestore, update `new-payment.html`'s `<select>`
> options to be populated from `settings/general` on page load — the data is
> already being saved and ready to use.

---

## How to Add Suppliers

1. Log in as **Administrator**.
2. Go to **Settings → Suppliers** tab.
3. Click **Add Supplier**, fill in Supplier Name, Supplier Code and Contact, then **Save Supplier**.
4. Suppliers are stored in the `suppliers` Firestore collection and also appear automatically in **Reports → Top Suppliers** and the **Supplier Profile** modal based on actual payment history.

---

## How to Back Up the Database

**Option A — Firebase Console export (recommended for full backups):**
1. Enable the [Firestore Export/Import feature](https://firebase.google.com/docs/firestore/manage-data/export-import) via Google Cloud Console (requires a billing-enabled project and a Cloud Storage bucket).
2. Run:
   ```bash
   gcloud firestore export gs://<your-backup-bucket>/backups/$(date +%Y-%m-%d)
   ```

**Option B — Manual export from the app (quick, no billing required):**
1. Go to **Reports**, set Period to **All Time**, clear other filters.
2. Click **Export Excel** (or **PDF**) to download a full snapshot of every payment request matching your filters.
3. Repeat periodically (e.g. monthly) and store the files securely.

---

## Security Model

- **Authentication required** for every page except `login.html` (enforced client-side via `requireAuth()` in `js/app.js`, and server-side via Firestore/Storage rules).
- **Role-based access** is derived from the signed-in user's email and re-validated in Firestore/Storage security rules — client-side checks alone are never trusted.
- **Accounts** can only create/read/edit their **own** requests, and only while status is `Draft`.
- **Administrator** and **Operations Manager** can read all requests and transition status to Approved / Rejected / On Hold / Paid; only **Administrator** can delete records or manage Settings/Suppliers.
- **File validation** on upload: type allow-list (PDF, PNG, JPG, DOC/DOCX, XLS/XLSX) and a 10MB size cap, enforced both client-side (`validateFile()`) and in `storage.rules`.
- **Input validation** on every required field in the New Payment Request form before submission is allowed.

---

## Final Deployment Checklist

Use this checklist to take the portal live:

- [ ] Create a Firebase project and register a Web App
- [ ] Paste your Firebase config into `js/firebase/firebase-config.js`
- [ ] Enable **Email/Password** sign-in in Firebase Authentication
- [ ] Enable **Firestore Database** (production mode)
- [ ] Enable **Firebase Storage** (production mode)
- [ ] Publish `firestore.rules` and `storage.rules` (Console or CLI)
- [ ] Create the 3 users in Authentication: `accounts@aptitude.ae`, `admin@aptitude.ae`, `operations@aptitude.ae`
- [ ] Push the project to a new GitHub repository
- [ ] Enable GitHub Pages (Settings → Pages → Source → GitHub Actions, or Deploy from branch `main`)
- [ ] Visit your GitHub Pages URL and confirm the login page loads (glassmorphism, dark navy theme)
- [ ] Log in as each of the 3 roles and confirm the correct dashboard/menu appears
- [ ] Submit a test payment request as **Accounts**, then approve/hold/reject it as **Admin** or **Operations**
- [ ] Confirm the notification bell updates and the approval timeline records the action
- [ ] Test PDF and Excel/CSV export from Approvals, History and Reports
- [ ] Replace `assets/images/logo.svg` / `favicon.svg` with your real company branding
- [ ] Set your company name and default currency in **Settings → General**
- [ ] Share portal credentials with your Accounts, Admin, and Operations users

🎉 Your Aptitude Payment Approval Portal is now live.
