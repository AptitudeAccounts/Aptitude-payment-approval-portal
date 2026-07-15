/* =========================================================================
   reports.js
   Reports & Analytics: date/status/outlet/supplier filters, six charts,
   top suppliers table (with Pending count+amount and Total Paid based on
   payments actually marked Paid), and a per-supplier profile modal.
   ========================================================================= */

let reportAllPayments = [];
let reportFiltered = [];
const chartInstances = {};

document.addEventListener("DOMContentLoaded", async () => {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return;
  }
  renderShell("reports.html", "Reports & Analytics", "Insights across every payment request");

  document.getElementById("filterPeriod").addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    document.getElementById("customFromWrap").classList.toggle("d-none", !isCustom);
    document.getElementById("customToWrap").classList.toggle("d-none", !isCustom);
  });

  document.getElementById("applyReportFilterBtn").addEventListener("click", applyReportFilters);
  document.getElementById("exportReportPdfBtn").addEventListener("click", () => exportPaymentListPdf(reportFiltered, "Payment Report"));
  document.getElementById("exportReportExcelBtn").addEventListener("click", () => exportPaymentsExcel(reportFiltered, "payment-report"));

  const isAccounts = user.role === "Accounts";
  let q = db.collection("payments");
  if (isAccounts) q = q.where("requestedBy.uid", "==", CURRENT_USER.uid);

  try {
    const snap = await q.get();
    reportAllPayments = [];
    snap.forEach((doc) => reportAllPayments.push({ id: doc.id, ...doc.data() }));
    applyReportFilters();
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load report data: " + err.message, "danger");
  }
});

function inPeriod(date, period, from, to) {
  if (!date) return period === "all";
  const now = new Date();
  if (period === "all") return true;
  if (period === "daily") return date.toDateString() === now.toDateString();
  if (period === "weekly") {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return date >= weekAgo && date <= now;
  }
  if (period === "monthly") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === "quarterly") {
    const q1 = Math.floor(date.getMonth() / 3);
    const q2 = Math.floor(now.getMonth() / 3);
    return date.getFullYear() === now.getFullYear() && q1 === q2;
  }
  if (period === "yearly") return date.getFullYear() === now.getFullYear();
  if (period === "custom") {
    if (!from && !to) return true;
    const fromD = from ? new Date(from) : new Date(0);
    const toD = to ? new Date(to) : new Date(8640000000000000);
    toD.setHours(23, 59, 59, 999);
    return date >= fromD && date <= toD;
  }
  return true;
}

function applyReportFilters() {
  const period = document.getElementById("filterPeriod").value;
  const status = document.getElementById("filterStatus").value;
  const outlet = document.getElementById("filterOutlet").value;
  const supplier = document.getElementById("filterSupplier").value.trim().toLowerCase();
  const from = document.getElementById("customFrom").value;
  const to = document.getElementById("customTo").value;

  reportFiltered = reportAllPayments.filter((p) => {
    const date = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate() : null;
    if (!inPeriod(date, period, from, to)) return false;
    if (status && p.status !== status) return false;
    if (outlet && p.outlet !== outlet) return false;
    if (supplier && !(p.supplierName || "").toLowerCase().includes(supplier)) return false;
    return true;
  });

  renderReportKpis();
  renderMonthlyChart();
  renderOutletChart();
  renderCategoryChart();
  renderStatusAnalysisChart();
  renderTrendReportChart();
  renderTopSuppliers();
}

function renderReportKpis() {
  const total = reportFiltered.reduce((s, p) => s + Number(p.amount || 0), 0);
  const paid = reportFiltered.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pending = reportFiltered.filter((p) => p.status === "Pending Approval").length;
  const avg = reportFiltered.length ? total / reportFiltered.length : 0;

  const cards = [
    { label: "Total Requests", value: reportFiltered.length, icon: "fa-file-invoice", bg: "bg-soft-navy" },
    { label: "Total Value", value: formatCurrency(total, "AED"), icon: "fa-coins", bg: "bg-soft-gold" },
    { label: "Total Paid", value: formatCurrency(paid, "AED"), icon: "fa-sack-dollar", bg: "bg-soft-success" },
    { label: "Pending Count", value: pending, icon: "fa-hourglass-half", bg: "bg-soft-teal" },
    { label: "Average Payment", value: formatCurrency(avg, "AED"), icon: "fa-calculator", bg: "bg-soft-navy" }
  ];
  document.getElementById("reportKpiRow").innerHTML = cards.map((c) => `
    <div class="col-6 col-md-4 col-xl-2dot4" style="flex:1 0 19%;max-width:19%;">
      <div class="kpi-card">
        <div class="kpi-icon ${c.bg}"><i class="fa-solid ${c.icon}"></i></div>
        <p class="kpi-value" style="font-size:20px;">${c.value}</p>
        <p class="kpi-label">${c.label}</p>
      </div>
    </div>`).join("");
}

function destroyChart(key) { if (chartInstances[key]) chartInstances[key].destroy(); }

function renderMonthlyChart() {
  const months = [];
  const labels = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${d.getMonth()}`);
    labels.push(d.toLocaleString(undefined, { month: "short" }));
  }
  const data = months.map((key) => reportFiltered
    .filter((p) => p.createdAt && p.createdAt.toDate && `${p.createdAt.toDate().getFullYear()}-${p.createdAt.toDate().getMonth()}` === key)
    .reduce((s, p) => s + Number(p.amount || 0), 0));

  destroyChart("monthly");
  chartInstances.monthly = new Chart(document.getElementById("monthlyChart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Amount", data, backgroundColor: "#1A3A6E", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EEF1F6" } }, x: { grid: { display: false } } } }
  });
}

function renderOutletChart() {
  const outlets = ["Louvre", "ARC", "S45 Khalidya", "DGE", "Al Qana", "Al Nahyan"];
  const data = outlets.map((o) => reportFiltered.filter((p) => p.outlet === o).reduce((s, p) => s + Number(p.amount || 0), 0));
  destroyChart("outlet");
  chartInstances.outlet = new Chart(document.getElementById("outletChart"), {
    type: "bar",
    data: { labels: outlets, datasets: [{ label: "Amount", data, backgroundColor: "#C9A24B", borderRadius: 6 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: "#EEF1F6" } } } }
  });
}

function renderCategoryChart() {
  const categories = ["Expense", "Inventory", "Utility", "Salary", "Maintenance", "Tax", "Other"];
  const colors = ["#1FA2A6", "#2E6FE0", "#C9A24B", "#7B41C9", "#1E8E5A", "#C0392B", "#8E9BB8"];
  const data = categories.map((c) => reportFiltered.filter((p) => p.category === c).length);
  destroyChart("category");
  chartInstances.category = new Chart(document.getElementById("categoryChart"), {
    type: "pie",
    data: { labels: categories, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 9, font: { size: 9.5 } } } } }
  });
}

function renderStatusAnalysisChart() {
  const statuses = ["Draft", "Submitted", "Pending Approval", "Approved", "Rejected", "On Hold", "Paid"];
  const colors = ["#8E9BB8", "#2E6FE0", "#D9A441", "#1E8E5A", "#C0392B", "#7B41C9", "#0F7A4C"];
  const data = statuses.map((s) => reportFiltered.filter((p) => p.status === s).length);
  destroyChart("statusAnalysis");
  chartInstances.statusAnalysis = new Chart(document.getElementById("statusAnalysisChart"), {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 9, font: { size: 9 } } } }, cutout: "62%" }
  });
}

function renderTrendReportChart() {
  const days = [];
  const labels = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    days.push(d.toDateString());
    labels.push(d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }));
  }
  const data = days.map((key) => reportFiltered
    .filter((p) => p.createdAt && p.createdAt.toDate && p.createdAt.toDate().toDateString() === key)
    .reduce((s, p) => s + Number(p.amount || 0), 0));
  destroyChart("trendReport");
  chartInstances.trendReport = new Chart(document.getElementById("trendReportChart"), {
    type: "line",
    data: { labels, datasets: [{ label: "Amount", data, borderColor: "#1FA2A6", backgroundColor: "rgba(31,162,166,0.12)", fill: true, tension: 0.35, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EEF1F6" } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } } } }
  });
}

function renderTopSuppliers() {
  const bySupplier = {};
  reportFiltered.forEach((p) => {
    const key = p.supplierName || "Unknown";
    if (!bySupplier[key]) bySupplier[key] = {
      name: key, code: p.supplierCode, count: 0,
      pendingCount: 0, pendingAmount: 0,
      paidAmount: 0, paidCount: 0, payments: []
    };
    bySupplier[key].count++;
    if (p.status === "Pending Approval" || p.status === "Submitted" || p.status === "On Hold") {
      bySupplier[key].pendingCount++;
      bySupplier[key].pendingAmount += Number(p.amount || 0);
    }
    if (p.status === "Paid") {
      bySupplier[key].paidAmount += Number(p.amount || 0);
      bySupplier[key].paidCount++;
    }
    bySupplier[key].payments.push(p);
  });

  const list = Object.values(bySupplier).sort((a, b) => b.paidAmount - a.paidAmount).slice(0, 10);
  const body = document.getElementById("topSuppliersBody");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" class="text-center text-muted-soft py-4">No supplier data for this filter.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((s, i) => {
    const avg = s.paidCount ? s.paidAmount / s.paidCount : 0;
    const lastPaid = s.payments
      .filter((p) => p.status === "Paid" && p.paidAt)
      .sort((a, b) => b.paidAt.toDate() - a.paidAt.toDate())[0];
    return `
    <tr>
      <td>${i + 1}</td>
      <td><a href="#" class="supplier-link fw-semibold" data-supplier="${escapeHtml(s.name)}">${escapeHtml(s.name)}</a></td>
      <td>${s.count}</td>
      <td>${s.pendingCount} &middot; ${formatCurrency(s.pendingAmount, "AED")}</td>
      <td>${formatCurrency(s.paidAmount, "AED")}</td>
      <td>${formatCurrency(avg, "AED")}</td>
      <td>${lastPaid ? formatDate(lastPaid.paidAt) : "-"}</td>
      <td><button class="btn-icon-action" onclick="openSupplierProfile('${escapeHtml(s.name)}')"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".supplier-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openSupplierProfile(a.dataset.supplier);
    });
  });
}

function openSupplierProfile(supplierName) {
  const payments = reportAllPayments.filter((p) => p.supplierName === supplierName);
  document.getElementById("supplierModalName").textContent = supplierName;

  const totalPaid = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingAmount = payments.filter((p) => p.status === "Pending Approval" || p.status === "Submitted" || p.status === "On Hold").reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidCount = payments.filter((p) => p.status === "Paid").length;
  const avgPayment = paidCount ? totalPaid / paidCount : 0;
  const lastPaid = payments.filter((p) => p.status === "Paid" && p.paidAt).sort((a, b) => b.paidAt.toDate() - a.paidAt.toDate())[0];

  const kpis = [
    { label: "Total Paid", value: formatCurrency(totalPaid, "AED") },
    { label: "Total Requests", value: payments.length },
    { label: "Pending Amount", value: formatCurrency(pendingAmount, "AED") },
    { label: "Average Payment", value: formatCurrency(avgPayment, "AED") },
    { label: "Last Payment", value: lastPaid ? formatDate(lastPaid.paidAt) : "-" }
  ];
  document.getElementById("supplierKpiRow").innerHTML = kpis.map((k) => `
    <div class="col-6 col-md-2dot4" style="flex:1 0 19%;max-width:19%;">
      <div class="kpi-card p-2 text-center">
        <p class="kpi-value" style="font-size:16px;">${k.value}</p>
        <p class="kpi-label" style="font-size:10.5px;">${k.label}</p>
      </div>
    </div>`).join("");

  const months = [];
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${d.getMonth()}`);
    labels.push(d.toLocaleString(undefined, { month: "short" }));
  }
  const monthData = months.map((key) => payments
    .filter((p) => p.createdAt && p.createdAt.toDate && `${p.createdAt.toDate().getFullYear()}-${p.createdAt.toDate().getMonth()}` === key)
    .reduce((s, p) => s + Number(p.amount || 0), 0));

  destroyChart("supplierMonthly");
  chartInstances.supplierMonthly = new Chart(document.getElementById("supplierMonthlyChart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Amount", data: monthData, backgroundColor: "#1FA2A6", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EEF1F6" } }, x: { grid: { display: false } } } }
  });

  const body = document.getElementById("supplierHistoryBody");
  body.innerHTML = payments
    .sort((a, b) => (b.createdAt ? b.createdAt.toDate() : 0) - (a.createdAt ? a.createdAt.toDate() : 0))
    .map((p) => `
      <tr>
        <td class="mono-id">${p.paymentId}</td>
        <td>${formatCurrency(p.amount, p.currency)}</td>
        <td>${formatDate(p.createdAt)}</td>
        <td>${statusBadge(p.status)}</td>
      </tr>`).join("");

  new bootstrap.Modal(document.getElementById("supplierModal")).show();
}
