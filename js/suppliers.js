/* =========================================================================
   suppliers.js
   Supplier Directory: live prefix search (scales to very large supplier
   lists without loading everything into the browser), and a payment
   history modal per supplier computed on demand from actual payment
   records (always accurate, no separate counters to keep in sync).
   ========================================================================= */

let supplierSearchTimer = null;
let supplierHistoryChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth();
  } catch (e) {
    return;
  }
  renderShell("suppliers.html", "Suppliers", "Search your permanent supplier directory and payment history");

  const searchInput = document.getElementById("supplierSearchInput");
  searchInput.addEventListener("input", () => {
    clearTimeout(supplierSearchTimer);
    supplierSearchTimer = setTimeout(() => loadSuppliers(searchInput.value.trim()), 300);
  });

  await loadSuppliers("");
});

async function loadSuppliers(term) {
  const body = document.getElementById("suppliersTableBody");
  const emptyState = document.getElementById("suppliersEmptyState");
  body.innerHTML = `<tr><td colspan="5"><div class="skeleton skeleton-row"></div></td></tr>`.repeat(3);
  emptyState.classList.add("d-none");

  try {
    let query;
    const termLower = term.toLowerCase();

    if (termLower) {
      // Prefix search: works efficiently no matter how large the collection grows,
      // since Firestore only returns matching documents, never the whole list.
      query = db.collection("suppliers")
        .where("nameLower", ">=", termLower)
        .where("nameLower", "<=", termLower + "\uf8ff")
        .orderBy("nameLower")
        .limit(50);
    } else {
      query = db.collection("suppliers").orderBy("name").limit(50);
    }

    const snap = await query.get();
    document.getElementById("supplierCountLabel").textContent =
      snap.size === 50 ? "Showing first 50 results — refine your search for more" : `${snap.size} supplier(s)`;

    if (snap.empty) {
      body.innerHTML = "";
      emptyState.classList.remove("d-none");
      return;
    }

    let html = "";
    snap.forEach((doc) => {
      const s = doc.data();
      html += `
        <tr>
          <td class="fw-semibold">${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.code || "-")}</td>
          <td>${escapeHtml(s.contact || "-")}</td>
          <td>${formatDate(s.updatedAt || s.createdAt)}</td>
          <td>
            <button class="btn btn-sm btn-outline-navy" onclick="openSupplierHistory('${escapeHtml(s.name).replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-clock-rotate-left me-1"></i>View History
            </button>
          </td>
        </tr>`;
    });
    body.innerHTML = html;
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load suppliers: " + err.message, "danger");
  }
}

async function openSupplierHistory(supplierName) {
  document.getElementById("supplierHistoryModalName").textContent = supplierName;
  document.getElementById("supplierHistoryKpiRow").innerHTML = `<div class="col-12 text-center py-3"><div class="skeleton skeleton-row"></div></div>`;
  document.getElementById("supplierHistoryTableBody").innerHTML = "";
  new bootstrap.Modal(document.getElementById("supplierHistoryModal")).show();

  try {
    let query = db.collection("payments").where("supplierName", "==", supplierName);
    if (CURRENT_USER.role === "Accounts") {
      query = query.where("requestedBy.uid", "==", CURRENT_USER.uid);
    }
    const snap = await query.get();
    const payments = [];
    snap.forEach((doc) => payments.push({ id: doc.id, ...doc.data() }));

    const totalPaid = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const pendingAmount = payments.filter((p) => p.status === "Pending Approval" || p.status === "Submitted").reduce((s, p) => s + Number(p.amount || 0), 0);
    const avgPayment = payments.length ? payments.reduce((s, p) => s + Number(p.amount || 0), 0) / payments.length : 0;
    const sorted = payments.filter((p) => p.createdAt).sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
    const last = sorted[0];

    const kpis = [
      { label: "Total Requests", value: payments.length },
      { label: "Total Paid", value: formatCurrency(totalPaid, "AED") },
      { label: "Pending Amount", value: formatCurrency(pendingAmount, "AED") },
      { label: "Average Payment", value: formatCurrency(avgPayment, "AED") },
      { label: "Last Payment", value: last ? formatDate(last.createdAt) : "-" }
    ];
    document.getElementById("supplierHistoryKpiRow").innerHTML = kpis.map((k) => `
      <div class="col-6 col-md" style="flex:1;">
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

    if (supplierHistoryChartInstance) supplierHistoryChartInstance.destroy();
    supplierHistoryChartInstance = new Chart(document.getElementById("supplierHistoryChart"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Amount", data: monthData, backgroundColor: "#1FA2A6", borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: "#EEF1F6" } }, x: { grid: { display: false } } } }
    });

    document.getElementById("supplierHistoryTableBody").innerHTML = sorted.length
      ? sorted.map((p) => `
        <tr>
          <td class="mono-id"><a href="payment-details.html?id=${p.id}">${p.paymentId}</a></td>
          <td>${escapeHtml(p.outlet)}</td>
          <td>${formatCurrency(p.amount, p.currency)}</td>
          <td>${formatDate(p.createdAt)}</td>
          <td>${statusBadge(p.status)}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="text-center text-muted-soft py-4">No payment history for this supplier yet.</td></tr>`;
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load supplier history: " + err.message, "danger");
  }
}
