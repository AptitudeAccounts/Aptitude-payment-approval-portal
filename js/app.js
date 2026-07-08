/* =========================================================================
   app.js
   Shared application shell: auth guard, sidebar/topbar rendering, toasts,
   spinner, notifications, and common helper functions used across every
   page of the Aptitude Payment Approval Portal.
   ========================================================================= */

const CURRENT_USER = { uid: null, email: null, name: null, role: null };

const STATUS_CLASS = {
  "Draft": "status-draft",
  "Submitted": "status-submitted",
  "Pending Approval": "status-pending",
  "Approved": "status-approved",
  "Rejected": "status-rejected",
  "On Hold": "status-hold",
  "Paid": "status-paid"
};

const NAV_ITEMS = {
  "Accounts": [
    { section: "Main" },
    { href: "dashboard.html", icon: "fa-gauge-high", label: "Dashboard" },
    { href: "new-payment.html", icon: "fa-circle-plus", label: "New Payment" },
    { href: "history.html", icon: "fa-clock-rotate-left", label: "My Requests" },
    { section: "Insights" },
    { href: "suppliers.html", icon: "fa-building", label: "Suppliers" },
    { href: "reports.html", icon: "fa-chart-column", label: "Reports" }
  ],
  "Administrator": [
    { section: "Main" },
    { href: "dashboard.html", icon: "fa-gauge-high", label: "Dashboard" },
    { href: "approval.html", icon: "fa-stamp", label: "Approvals" },
    { href: "history.html", icon: "fa-clock-rotate-left", label: "All Requests" },
    { section: "Insights" },
    { href: "suppliers.html", icon: "fa-building", label: "Suppliers" },
    { href: "reports.html", icon: "fa-chart-column", label: "Reports" },
    { section: "Administration" },
    { href: "settings.html", icon: "fa-sliders", label: "Settings" },
    { href: "settings.html#users", icon: "fa-users-gear", label: "User Management" }
  ],
  "Operations Manager": [
    { section: "Main" },
    { href: "dashboard.html", icon: "fa-gauge-high", label: "Dashboard" },
    { href: "approval.html", icon: "fa-stamp", label: "Approvals" },
    { href: "history.html", icon: "fa-clock-rotate-left", label: "All Requests" },
    { section: "Insights" },
    { href: "suppliers.html", icon: "fa-building", label: "Suppliers" },
    { href: "reports.html", icon: "fa-chart-column", label: "Reports" }
  ]
};

/* =========================================================================
   Spinner
   ========================================================================= */
function showSpinner(message) {
  hideSpinner();
  const overlay = document.createElement("div");
  overlay.className = "spinner-overlay";
  overlay.id = "globalSpinner";
  overlay.innerHTML = `
    <div class="spinner-box">
      <div class="spinner-ring"></div>
      <div>${message || "Loading..."}</div>
    </div>`;
  document.body.appendChild(overlay);
}
function hideSpinner() {
  const el = document.getElementById("globalSpinner");
  if (el) el.remove();
}

/* =========================================================================
   Toasts
   ========================================================================= */
function ensureToastStack() {
  let stack = document.getElementById("toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(title, message, type) {
  type = type || "info";
  const icons = {
    success: "fa-circle-check",
    danger: "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info"
  };
  const stack = ensureToastStack();
  const el = document.createElement("div");
  el.className = `app-toast ${type}`;
  el.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} text-${type === 'info' ? 'primary' : type}"></i>
    <div>
      <p class="toast-title">${title}</p>
      <p class="toast-msg">${message || ""}</p>
    </div>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

/* =========================================================================
   Formatting helpers
   ========================================================================= */
function formatCurrency(amount, currency) {
  const n = Number(amount || 0);
  return `${currency || "AED"} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = value.toDate ? value.toDate() : new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = value.toDate ? value.toDate() : new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status) {
  const cls = STATUS_CLASS[status] || "status-draft";
  return `<span class="status-badge ${cls}">${status}</span>`;
}

function priorityBadge(priority) {
  const cls = priority === "Urgent" ? "priority-urgent" : "priority-normal";
  return `<span class="priority-badge ${cls}">${priority || "Normal"}</span>`;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* Generates a human readable, sequential-looking payment ID e.g. PAY-2026-000482 */
async function generatePaymentId() {
  const year = new Date().getFullYear();
  const counterRef = db.collection("counters").doc(`payments-${year}`);
  const newValue = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? doc.data().value : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `PAY-${year}-${String(newValue).padStart(6, "0")}`;
}

/* =========================================================================
   Auth guard — every protected page calls requireAuth(["Role1","Role2"])
   ========================================================================= */
function requireAuth(allowedRoles) {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "login.html";
        return reject(new Error("Not authenticated"));
      }
      const roleInfo = getRoleForEmail(user.email);
      if (!roleInfo) {
        showToast("Access Denied", "Your account is not authorized for this portal.", "danger");
        await auth.signOut();
        window.location.href = "login.html";
        return reject(new Error("Unauthorized email"));
      }
      CURRENT_USER.uid = user.uid;
      CURRENT_USER.email = user.email;
      CURRENT_USER.role = roleInfo.role;
      CURRENT_USER.name = roleInfo.label;

      if (allowedRoles && allowedRoles.length && !allowedRoles.includes(roleInfo.role)) {
        window.location.href = "dashboard.html";
        return reject(new Error("Role not permitted on this page"));
      }
      resolve(CURRENT_USER);
    });
  });
}

/* =========================================================================
   Sidebar + Topbar renderer
   ========================================================================= */
function renderShell(activeHref, pageTitle, pageSubtitle) {
  const items = NAV_ITEMS[CURRENT_USER.role] || [];
  let navHtml = "";
  items.forEach((item) => {
    if (item.section) {
      navHtml += `<div class="nav-section-label">${item.section}</div>`;
    } else {
      const isActive = item.href.split("#")[0] === activeHref ? "active" : "";
      navHtml += `
        <a class="nav-link ${isActive}" href="${item.href}">
          <i class="fa-solid ${item.icon}"></i> <span>${item.label}</span>
        </a>`;
    }
  });

  const sidebarHtml = `
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    <aside class="sidebar" id="appSidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">A</div>
        <div class="brand-text">
          <b>Aptitude</b>
          <span>Payment Approval Portal</span>
        </div>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        &copy; ${new Date().getFullYear()} Aptitude LLC<br>All rights reserved.
      </div>
    </aside>`;

  const topbarHtml = `
    <header class="topbar">
      <div class="d-flex align-items-center gap-3">
        <button class="icon-btn d-lg-none" id="sidebarToggleBtn"><i class="fa-solid fa-bars"></i></button>
        <div>
          <p class="page-title">${pageTitle || ""}</p>
          <p class="page-subtitle">${pageSubtitle || ""}</p>
        </div>
      </div>
      <div class="topbar-search d-none d-md-block">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="globalSearchInput" placeholder="Search payment ID, supplier, invoice...">
      </div>
      <div class="topbar-actions">
        <div class="dropdown">
          <button class="icon-btn" id="notifBtn" data-bs-toggle="dropdown" data-bs-auto-close="outside">
            <i class="fa-regular fa-bell"></i>
            <span class="dot" id="notifDot" style="display:none;"></span>
          </button>
          <div class="dropdown-menu dropdown-menu-end notif-panel p-0" id="notifPanel">
            <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
              <b class="small">Notifications</b>
              <a href="#" class="small" id="markAllReadBtn">Mark all read</a>
            </div>
            <div id="notifList"><div class="p-4 text-center text-muted small">Loading...</div></div>
          </div>
        </div>
        <div class="dropdown">
          <div class="user-chip" data-bs-toggle="dropdown">
            <div class="avatar">${initials(CURRENT_USER.name)}</div>
            <div class="who d-none d-sm-block">
              <b>${CURRENT_USER.name}</b>
              <span>${CURRENT_USER.role}</span>
            </div>
            <i class="fa-solid fa-chevron-down small text-muted"></i>
          </div>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="profile.html"><i class="fa-regular fa-user me-2"></i>My Profile</a></li>
            ${CURRENT_USER.role === "Administrator" ? '<li><a class="dropdown-item" href="settings.html"><i class="fa-solid fa-sliders me-2"></i>Settings</a></li>' : ""}
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="#" id="logoutBtn"><i class="fa-solid fa-arrow-right-from-bracket me-2"></i>Logout</a></li>
          </ul>
        </div>
      </div>
    </header>`;

  document.getElementById("shellSidebarSlot").innerHTML = sidebarHtml;
  document.getElementById("shellTopbarSlot").innerHTML = topbarHtml;

  document.getElementById("logoutBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    showSpinner("Signing out...");
    await auth.signOut();
    window.location.href = "login.html";
  });

  const toggleBtn = document.getElementById("sidebarToggleBtn");
  const sidebarEl = document.getElementById("appSidebar");
  const overlayEl = document.getElementById("sidebarOverlay");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      sidebarEl.classList.toggle("show");
      overlayEl.classList.toggle("show");
    });
    overlayEl.addEventListener("click", () => {
      sidebarEl.classList.remove("show");
      overlayEl.classList.remove("show");
    });
  }

  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        window.location.href = `history.html?q=${encodeURIComponent(searchInput.value.trim())}`;
      }
    });
  }

  initNotifications();
}

/* =========================================================================
   Notifications
   ========================================================================= */
function notifIconFor(type) {
  const map = {
    "New Request": { icon: "fa-file-circle-plus", bg: "bg-soft-navy" },
    "Approval": { icon: "fa-circle-check", bg: "bg-soft-success" },
    "Rejection": { icon: "fa-circle-xmark", bg: "bg-soft-danger" },
    "Hold": { icon: "fa-hand", bg: "bg-soft-gold" },
    "Payment Processed": { icon: "fa-sack-dollar", bg: "bg-soft-teal" }
  };
  return map[type] || { icon: "fa-bell", bg: "bg-soft-navy" };
}

function initNotifications() {
  db.collection("notifications")
    .where("recipientRole", "in", [CURRENT_USER.role, "All"])
    .orderBy("createdAt", "desc")
    .limit(25)
    .onSnapshot((snap) => {
      const list = document.getElementById("notifList");
      const dot = document.getElementById("notifDot");
      if (!list) return;
      if (snap.empty) {
        list.innerHTML = `<div class="p-4 text-center text-muted small">No notifications yet.</div>`;
        if (dot) dot.style.display = "none";
        return;
      }
      let unread = 0;
      let html = "";
      snap.forEach((doc) => {
        const n = doc.data();
        if (!n.readBy || !n.readBy.includes(CURRENT_USER.uid)) unread++;
        const meta = notifIconFor(n.type);
        html += `
          <div class="notif-item ${(!n.readBy || !n.readBy.includes(CURRENT_USER.uid)) ? "unread" : ""}">
            <div class="notif-icon ${meta.bg}"><i class="fa-solid ${meta.icon}"></i></div>
            <div>
              <p class="notif-title">${escapeHtml(n.message)}</p>
              <span class="notif-time">${formatDateTime(n.createdAt)}</span>
            </div>
          </div>`;
      });
      list.innerHTML = html;
      if (dot) dot.style.display = unread > 0 ? "block" : "none";
    }, (err) => {
      console.error("Notification stream error", err);
    });

  const markAllBtn = document.getElementById("markAllReadBtn");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const snap = await db.collection("notifications")
        .where("recipientRole", "in", [CURRENT_USER.role, "All"])
        .get();
      const batch = db.batch();
      snap.forEach((doc) => {
        batch.update(doc.ref, {
          readBy: firebase.firestore.FieldValue.arrayUnion(CURRENT_USER.uid)
        });
      });
      await batch.commit();
    });
  }
}

async function createNotification(type, message, recipientRole) {
  await db.collection("notifications").add({
    type,
    message,
    recipientRole: recipientRole || "All",
    readBy: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
