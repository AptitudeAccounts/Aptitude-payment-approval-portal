/* =========================================================================
   history.js
   Full payment history / "My Requests" table: search, filter, sort,
   pagination, and export. Accounts users see only their own requests;
   Admin & Operations Manager see everyone's.
   ========================================================================= */

let allPayments = [];
let filteredPayments = [];
let sortKey = "createdAt";
let sortDir = "desc";
let currentPage = 1;
const pageSize = 10;

document.addEventListener("DOMContentLoaded", async () => {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    return;
  }
  const isAccounts = user.role === "Accounts";
  renderShell("history.html", isAccounts ? "My Requests" : "All Requests", "Search, filter and manage payment requests");
  document.getElementById("historyTitle").innerHTML =
    `<i class="fa-solid fa-clock-rotate-left me-2 text-muted-soft"></i>${isAccounts ? "My Requests" : "Payment History"}`;

  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) document.getElementById("filterSearch").value = q;

  document.getElementById("applyFilterBtn").addEventListener("click", applyFilters);
  document.getElementById("resetFilterBtn").addEventListener("click", resetFilters);
  document.getElementById("filterSearch").addEventListener("keypress", (e) => { if (e.key === "Enter") applyFilters(); });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else { sortKey = key; sortDir = "asc"; }
      renderTable();
    });
  });

  document.getElementById("exportPdfBtn").addEventListener("click", () => exportPaymentListPdf(filteredPayments, "Payment History"));
  document.getElementById("exportExcelBtn").addEventListener("click", () => exportPaymentsExcel(filteredPayments, "payment-history"));
  document.getElementById("exportCsvBtn").addEventListener("click", () => exportPaymentsCsv(filteredPayments, "payment-history"));

  await loadPayments(isAccounts);
  applyFilters();
});

async function loadPayments(isAccounts) {
  try {
    let q = db.collection("payments");
    if (isAccounts) q = q.where("requestedBy.uid", "==", CURRENT_USER.uid);
    const snap = await q.get();
    allPayments = [];
    snap.forEach((doc) => allPayments.push({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load payment history: " + err.message, "danger");
  }
}

function applyFilters() {
  const search = document.getElementById("filterSearch").value.trim().toLowerCase();
  const status = document.getElementById("filterStatus").value;
  const outlet = document.getElementById("filterOutlet").value;
  const category = document.getElementById("filterCategory").value;

  filteredPayments = allPayments.filter((p) => {
    if (status && p.status !== status) return false;
    if (outlet && p.outlet !== outlet) return false;
    if (category && p.category !== category) return false;
    if (search) {
      const haystack = [p.paymentId, p.supplierName, p.invoiceNumber, p.amount, p.purpose, p.outlet]
        .join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  currentPage = 1;
  renderTable();
}

function resetFilters() {
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterStatus").value = "";
  document.getElementById("filterOutlet").value = "";
  document.getElementById("filterCategory").value = "";
  applyFilters();
}

function sortValue(p, key) {
  if (key === "amount") return Number(p.amount || 0);
  if (key === "requiredPaymentDate") return p.requiredPaymentDate || "";
  return (p[key] || "").toString().toLowerCase();
}

function renderTable() {
  const sorted = [...filteredPayments].sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  const body = document.getElementById("historyTableBody");
  const emptyState = document.getElementById("historyEmptyState");

  if (!pageItems.length) {
    body.innerHTML = "";
    emptyState.classList.remove("d-none");
  } else {
    emptyState.classList.add("d-none");
    body.innerHTML = pageItems.map((p) => `
      <tr>
        <td class="mono-id">${p.paymentId}</td>
        <td>${escapeHtml(p.supplierName)}</td>
        <td>${escapeHtml(p.outlet)}</td>
        <td>${formatCurrency(p.amount, p.currency)}</td>
        <td>${escapeHtml(p.requestedBy ? p.requestedBy.name : "-")}</td>
        <td>${formatDate(p.requiredPaymentDate)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>
          <a href="payment-details.html?id=${p.id}" class="btn-icon-action" title="View"><i class="fa-regular fa-eye"></i></a>
          ${p.status === "Draft" && p.requestedBy && p.requestedBy.uid === CURRENT_USER.uid ?
            `<a href="new-payment.html?edit=${p.id}" class="btn-icon-action" title="Edit"><i class="fa-solid fa-pen"></i></a>` : ""}
        </td>
      </tr>`).join("");
  }

  document.getElementById("resultCount").textContent = `Showing ${pageItems.length} of ${sorted.length} results`;
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pag = document.getElementById("pagination");
  let html = "";
  for (let i = 1; i <= totalPages; i++) {
    html += `<li class="page-item ${i === currentPage ? "active" : ""}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
  }
  pag.innerHTML = html;
  pag.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = Number(a.dataset.page);
      renderTable();
    });
  });
}
