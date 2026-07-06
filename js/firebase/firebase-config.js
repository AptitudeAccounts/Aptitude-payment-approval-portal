/* =========================================================================
   firebase-config.js
   Firebase initialization for Aptitude Payment Approval Portal.

   IMPORTANT:
   Replace the placeholder values below with your own Firebase project
   configuration. You can find these values in:
   Firebase Console -> Project Settings -> General -> Your apps -> SDK setup

   This file uses the Firebase compat SDK (loaded via <script> tags in every
   HTML page) so the whole project can run on GitHub Pages with no build
   step or bundler.
   ========================================================================= */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase (guard against double init when included on many pages)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence where supported (best effort, ignore errors)
db.enablePersistence({ synchronizeTabs: true }).catch(() => {
  /* persistence not available in this browser / tab - safe to ignore */
});

/* =========================================================================
   Role mapping
   Three predefined accounts are mapped to their portal roles purely from
   their email address. This keeps the demo/setup simple: no separate
   Firestore "users" lookup is required to know a signed-in user's role.
   You still fully control access through Firestore & Storage Security
   Rules (see firestore.rules / storage.rules) which re-derive the same
   role from the authenticated user's email token.
   ========================================================================= */
const ROLE_MAP = {
  "accounts@aptitude.ae": { role: "Accounts", label: "Accounts Team" },
  "admin@aptitude.ae": { role: "Administrator", label: "Admin" },
  "operations@aptitude.ae": { role: "Operations Manager", label: "Operations" }
};

function getRoleForEmail(email) {
  if (!email) return null;
  const key = email.trim().toLowerCase();
  return ROLE_MAP[key] || null;
}
