/* =========================================================================
   approval.js
   Approvals screen for Admin & Operations Manager roles: status tabs,
   table with view/approve/hold/reject/print actions, and remarks-required
   modal workflow that appends a full audit trail entry to each payment.
   ========================================================================= */

let currentStatusFilter = "Pending Approval";
let currentPaymentsCache = [];
let pendingAction = null; // { docId, targetStatus, label }

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth(["Administrator", "Operations Manager"]);
  } catch (e) {
    return;
  }
  renderShell("approval.html", "Approvals", "Review, approve, hold, or reject payment requests");

  document.querySelectorAll("#statusTabs .nav-link").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll("#statusTabs .nav-link").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentStatusFilter = tab.dataset.status;
      document.getElementById("tableTitle").textContent = tab.textContent;
      loadApprovalTable();
    });
  });

  document.getElementById("exportPdfBtn").addEventListener("click", () => {
    exportPaymentListPdf(currentPaymentsCache, `${currentStatusFilter} Payments`);
  });
  document.getElementById("exportExcelBtn").addEventListener("click", () => {
    exportPaymentsExcel(currentPaymentsCache, `${currentStatusFilter}-payments`);
  });

  document.getElementById("actionConfirmBtn").addEventListener("click", confirmAction);

  loadApprovalTable();
});

async function loadApprovalTable() {
  const body = document.getElementById("approvalTableBody");
  const emptyState = document.getElementById("approvalEmptyState");
  body.innerHTML = `<tr><td colspan="9"><div class="skeleton skeleton-row"></div></td></tr>`.repeat(3);
  emptyState.classList.add("d-none");

  try {
    const snap = await db.collection("payments").where("status", "==", currentStatusFilter).get();
    const list = [];
    snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => (b.createdAt ? b.createdAt.toDate() : 0) - (a.createdAt ? a.createdAt.toDate() : 0));
    currentPaymentsCache = list;

    if (!list.length) {
      body.innerHTML = "";
      emptyState.classList.remove("d-none");
      return;
    }

    body.innerHTML = list.map((p) => `
      <tr>
        <td class="mono-id">${p.paymentId}</td>
        <td>${escapeHtml(p.supplierName)}</td>
        <td>${escapeHtml(p.outlet)}</td>
        <td>${formatCurrency(p.amount, p.currency)}</td>
        <td>${escapeHtml(p.requestedBy ? p.requestedBy.name : "-")}</td>
        <td>${formatDate(p.requiredPaymentDate)}</td>
        <td>${priorityBadge(p.priority)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>
          <a href="payment-details.html?id=${p.id}" class="btn-icon-action" title="View"><i class="fa-regular fa-eye"></i></a>
          ${currentStatusFilter === "Pending Approval" || currentStatusFilter === "On Hold" ? `
          <button class="btn-icon-action approve" title="Approve" onclick="openActionModal('${p.id}','${p.paymentId}','Approved')"><i class="fa-solid fa-check"></i></button>
          <button class="btn-icon-action hold" title="Hold" onclick="openActionModal('${p.id}','${p.paymentId}','On Hold')"><i class="fa-solid fa-hand"></i></button>
          <button class="btn-icon-action reject" title="Reject" onclick="openActionModal('${p.id}','${p.paymentId}','Rejected')"><i class="fa-solid fa-xmark"></i></button>
          ` : ""}
          <button class="btn-icon-action" title="Print" onclick='exportPaymentDetailPdf(${JSON.stringify(p).replace(/'/g, "&#39;")})'><i class="fa-solid fa-print"></i></button>
        </td>
      </tr>`).join("");
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load approvals: " + err.message, "danger");
  }
}

function openActionModal(docId, paymentId, targetStatus) {
  pendingAction = { docId, targetStatus };
  const titles = { "Approved": "Approve Payment", "Rejected": "Reject Payment", "On Hold": "Hold Payment" };
  const labels = { "Approved": "Approval Remarks", "Rejected": "Rejection Reason", "On Hold": "Hold Remarks" };
  const btnClass = { "Approved": "btn-teal", "Rejected": "btn-danger", "On Hold": "btn-navy" };

  document.getElementById("actionModalTitle").textContent = titles[targetStatus];
  document.getElementById("actionModalLabel").innerHTML = `${labels[targetStatus]} <span class="text-danger">*</span>`;
  document.getElementById("actionModalPaymentId").textContent = paymentId;
  document.getElementById("actionRemarks").value = "";
  document.getElementById("actionRemarksError").classList.add("d-none");

  const confirmBtn = document.getElementById("actionConfirmBtn");
  confirmBtn.className = `btn ${btnClass[targetStatus]}`;
  confirmBtn.textContent = titles[targetStatus];

  new bootstrap.Modal(document.getElementById("actionModal")).show();
}

async function confirmAction() {
  const remarks = document.getElementById("actionRemarks").value.trim();
  if (!remarks) {
    document.getElementById("actionRemarksError").classList.remove("d-none");
    return;
  }
  if (!pendingAction) return;

  const confirmBtn = document.getElementById("actionConfirmBtn");
  confirmBtn.disabled = true;
  showSpinner("Updating payment status...");

  try {
    const docRef = db.collection("payments").doc(pendingAction.docId);
    const historyEntry = {
      action: pendingAction.targetStatus,
      byName: CURRENT_USER.name,
      byRole: CURRENT_USER.role,
      remarks,
      timestamp: new Date().toISOString()
    };

    const update = {
      status: pendingAction.targetStatus,
      approvalHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (pendingAction.targetStatus === "Approved") {
      update.approvedBy = { uid: CURRENT_USER.uid, name: CURRENT_USER.name, role: CURRENT_USER.role };
      update.approvedAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    await docRef.update(update);

    const doc = await docRef.get();
    const paymentId = doc.data().paymentId;
    const requesterUid = doc.data().requestedBy ? doc.data().requestedBy.uid : null;

    const typeMap = { "Approved": "Approval", "Rejected": "Rejection", "On Hold": "Hold" };
    await createNotification(typeMap[pendingAction.targetStatus],
      `Payment ${paymentId} was ${pendingAction.targetStatus.toLowerCase()} by ${CURRENT_USER.name}.`, "Accounts");

    hideSpinner();
    confirmBtn.disabled = false;
    bootstrap.Modal.getInstance(document.getElementById("actionModal")).hide();
    showToast("Updated", `Payment ${paymentId} marked as ${pendingAction.targetStatus}.`, "success");
    pendingAction = null;
    loadApprovalTable();
  } catch (err) {
    console.error(err);
    hideSpinner();
    confirmBtn.disabled = false;
    showToast("Error", "Could not update payment: " + err.message, "danger");
  }
}
