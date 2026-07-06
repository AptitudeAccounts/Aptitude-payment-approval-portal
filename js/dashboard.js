/* =========================================================================
   dashboard.js
   Role-aware dashboard: KPI cards, trend chart, status breakdown chart,
   and recent requests table.
   ========================================================================= */

let trendChartInstance = null;
let statusChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth();
  } catch (e) {
    return;
  }

  const isAccounts = CURRENT_USER.role === "Accounts";
  renderShell("dashboard.html", "Dashboard", `Welcome back, ${CURRENT_USER.name}`);
  document.getElementById("recentTableTitle").innerHTML =
    `<i class="fa-solid fa-list me-2 text-muted-soft"></i>${isAccounts ? "My Recent Requests" : "Recent Requests"}`;

  loadDashboardData(isAccounts);
});

function baseQuery(isAccounts) {
  let q = db.collection("payments");
  if (isAccounts) {
    q = q.where("requestedBy.uid", "==", CURRENT_USER.uid);
  }
  return q;
}

async function loadDashboardData(isAccounts) {
  try {
    const snap = await baseQuery(isAccounts).get();
    const payments = [];
    snap.forEach((doc) => payments.push({ id: doc.id, ...doc.data() }));

    renderKpis(payments, isAccounts);
    renderTrendChart(payments);
    renderStatusChart(payments);
    renderRecentTable(payments);
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load dashboard data. " + err.message, "danger");
  }
}

function renderKpis(payments, isAccounts) {
  const now = new Date();
  const todayStr = now.toDateString();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const yearKey = `${now.getFullYear()}`;

  const count = (status) => payments.filter((p) => p.status === status).length;
  const pending = payments.filter((p) => p.status === "Submitted" || p.status === "Pending Approval").length;
  const approved = count("Approved");
  const rejected = count("Rejected");
  const held = count("On Hold");
  const paid = count("Paid");

  const todayTotal = payments
    .filter((p) => p.createdAt && p.createdAt.toDate && p.createdAt.toDate().toDateString() === todayStr)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const monthlyTotal = payments
    .filter((p) => p.createdAt && p.createdAt.toDate &&
      `${p.createdAt.toDate().getFullYear()}-${p.createdAt.toDate().getMonth()}` === monthKey)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const yearlyTotal = payments
    .filter((p) => p.createdAt && p.createdAt.toDate && `${p.createdAt.toDate().getFullYear()}` === yearKey)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const approvalTimes = payments
    .filter((p) => p.status === "Approved" && p.approvedAt && p.createdAt)
    .map((p) => (p.approvedAt.toDate() - p.createdAt.toDate()) / (1000 * 60 * 60));
  const avgApprovalTime = approvalTimes.length
    ? (approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length).toFixed(1)
    : "0.0";

  const cards = [
    { label: "Pending", value: pending, icon: "fa-hourglass-half", bg: "bg-soft-gold" },
    { label: "Approved", value: approved, icon: "fa-circle-check", bg: "bg-soft-success" },
    { label: "Rejected", value: rejected, icon: "fa-circle-xmark", bg: "bg-soft-danger" },
    { label: "On Hold", value: held, icon: "fa-hand", bg: "bg-soft-navy" },
    { label: "Paid", value: paid, icon: "fa-sack-dollar", bg: "bg-soft-teal" },
    { label: "Today's Payments", value: formatCurrency(todayTotal, "AED"), icon: "fa-calendar-day", bg: "bg-soft-navy" },
    { label: "Monthly Total", value: formatCurrency(monthlyTotal, "AED"), icon: "fa-calendar-days", bg: "bg-soft-gold" },
    { label: "Yearly Total", value: formatCurrency(yearlyTotal, "AED"), icon: "fa-calendar", bg: "bg-soft-success" },
    { label: "Avg. Approval Time", value: `${avgApprovalTime} hrs`, icon: "fa-stopwatch", bg: "bg-soft-teal" }
  ];

  const row = document.getElementById("kpiRow");
  row.innerHTML = cards.map((c) => `
    <div class="col-6 col-md-4 col-xl-3">
      <div class="kpi-card">
        <div class="kpi-icon ${c.bg}"><i class="fa-solid ${c.icon}"></i></div>
        <p class="kpi-value">${c.value}</p>
        <p class="kpi-label">${c.label}</p>
      </div>
    </div>`).join("");
}

function renderTrendChart(payments) {
  const months = [];
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${d.getMonth()}`);
    labels.push(d.toLocaleString(undefined, { month: "short", year: "2-digit" }));
  }
  const totals = months.map((key) =>
    payments
      .filter((p) => p.createdAt && p.createdAt.toDate &&
        `${p.createdAt.toDate().getFullYear()}-${p.createdAt.toDate().getMonth()}` === key)
      .reduce((s, p) => s + Number(p.amount || 0), 0)
  );

  const ctx = document.getElementById("trendChart");
  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Total Payments (AED)",
        data: totals,
        borderColor: "#1FA2A6",
        backgroundColor: "rgba(31,162,166,0.12)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: "#0B1E3D",
        pointRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: "#EEF1F6" } }, x: { grid: { display: false } } }
    }
  });
}

function renderStatusChart(payments) {
  const statuses = ["Draft", "Submitted", "Pending Approval", "Approved", "Rejected", "On Hold", "Paid"];
  const colors = ["#8E9BB8", "#2E6FE0", "#D9A441", "#1E8E5A", "#C0392B", "#7B41C9", "#0F7A4C"];
  const data = statuses.map((s) => payments.filter((p) => p.status === s).length);

  const ctx = document.getElementById("statusChart");
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: statuses,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10.5 } } } },
      cutout: "68%"
    }
  });
}

function renderRecentTable(payments) {
  const sorted = payments
    .filter((p) => p.createdAt)
    .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate())
    .slice(0, 8);

  const body = document.getElementById("recentPaymentsBody");
  const emptyState = document.getElementById("recentEmptyState");

  if (!sorted.length) {
    body.innerHTML = "";
    emptyState.classList.remove("d-none");
    return;
  }
  emptyState.classList.add("d-none");

  body.innerHTML = sorted.map((p) => `
    <tr>
      <td class="mono-id">${p.paymentId}</td>
      <td>${escapeHtml(p.supplierName)}</td>
      <td>${escapeHtml(p.outlet)}</td>
      <td>${formatCurrency(p.amount, p.currency)}</td>
      <td>${escapeHtml(p.requestedBy ? p.requestedBy.name : "-")}</td>
      <td>${formatDate(p.requiredPaymentDate)}</td>
      <td>${statusBadge(p.status)}</td>
      <td><a href="payment-details.html?id=${p.id}" class="btn-icon-action"><i class="fa-regular fa-eye"></i></a></td>
    </tr>`).join("");
}
