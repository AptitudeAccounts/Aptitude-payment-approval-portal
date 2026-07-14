/* =========================================================================
   payment-details.js
   Loads a single payment record and renders full information, approval
   timeline, attachments list, and wires up Print / Download PDF actions.
   ========================================================================= */

let currentPaymentData = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth();
  } catch (e) {
    return;
  }
  renderShell("history.html", "Payment Details", "Full information and approval trail");

  const params = new URLSearchParams(window.location.search);
  const docId = params.get("id");
  if (!docId) {
    showToast("Missing Payment", "No payment ID provided in the URL.", "danger");
    return;
  }

  await loadPaymentDetails(docId);

  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("downloadPdfBtn").addEventListener("click", () => {
    if (currentPaymentData) exportPaymentDetailPdf(currentPaymentData);
  });
});

const TIMELINE_ICONS = {
  "Draft Created": { icon: "fa-file", color: "#8E9BB8" },
  "Draft Updated": { icon: "fa-pen", color: "#8E9BB8" },
  "Submitted": { icon: "fa-paper-plane", color: "#2E6FE0" },
  "Updated & Resubmitted": { icon: "fa-arrows-rotate", color: "#2E6FE0" },
  "Approved": { icon: "fa-check", color: "#1E8E5A" },
  "Rejected": { icon: "fa-xmark", color: "#C0392B" },
  "On Hold": { icon: "fa-hand", color: "#7B41C9" },
  "Paid": { icon: "fa-sack-dollar", color: "#0F7A4C" }
};

async function loadPaymentDetails(docId) {
  try {
    const doc = await db.collection("payments").doc(docId).get();
    if (!doc.exists) {
      document.getElementById("detailsLoading").innerHTML = `
        <div class="empty-state"><i class="fa-regular fa-circle-question"></i><p>Payment not found.</p></div>`;
      return;
    }
    const p = { id: doc.id, ...doc.data() };
    currentPaymentData = p;

    if (CURRENT_USER.role === "Accounts" && (!p.requestedBy || p.requestedBy.uid !== CURRENT_USER.uid)) {
      document.getElementById("detailsLoading").innerHTML = `
        <div class="empty-state"><i class="fa-solid fa-lock"></i><p>You do not have access to this payment.</p></div>`;
      return;
    }

    document.getElementById("dPaymentId").textContent = p.paymentId;
    document.getElementById("dSupplier").textContent = `${p.supplierName} (${p.supplierCode || "-"})`;
    document.getElementById("dStatus").innerHTML = statusBadge(p.status);
    document.getElementById("dPriority").innerHTML = priorityBadge(p.priority);
    document.getElementById("dAmount").textContent = formatCurrency(p.amount, p.currency);
    document.getElementById("dOutlet").textContent = p.outlet;
    document.getElementById("dPaymentType").textContent = p.paymentType;
    document.getElementById("dCategory").textContent = p.category;
    document.getElementById("dInvoiceNumber").textContent = p.invoiceNumber;
    document.getElementById("dInvoiceDate").textContent = formatDate(p.invoiceDate);
    document.getElementById("dRequiredDate").textContent = formatDate(p.requiredPaymentDate);
    document.getElementById("dRequestedBy").textContent = p.requestedBy ? p.requestedBy.name : "-";
    document.getElementById("dPurpose").textContent = p.purpose;
    document.getElementById("dSupplierCode").textContent = p.supplierCode;
    document.getElementById("dDescription").textContent = p.description || "No description provided.";
    document.getElementById("dRemarks").textContent = p.remarks || "No remarks.";

    const timeline = (p.approvalHistory || []).slice().reverse();
    const timelineBox = document.getElementById("approvalTimeline");
    if (!timeline.length) {
      timelineBox.innerHTML = `<div class="empty-state"><i class="fa-regular fa-clock"></i><p>No history yet.</p></div>`;
    } else {
      timelineBox.innerHTML = timeline.map((h) => {
        const meta = TIMELINE_ICONS[h.action] || { icon: "fa-circle", color: "#8E9BB8" };
        return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>
          <h6>${h.action}</h6>
          <div class="timeline-meta">${escapeHtml(h.byName)} &middot; ${escapeHtml(h.byRole)} &middot; ${new Date(h.timestamp).toLocaleString()}</div>
          <div class="timeline-remark">${escapeHtml(h.remarks)}</div>
        </div>`;
      }).join("");
    }

    const attachBox = document.getElementById("attachmentsList");
    const attachments = p.attachments || [];
    if (!attachments.length) {
      attachBox.innerHTML = `<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>No attachments uploaded.</p></div>`;
    } else {
      attachBox.innerHTML = attachments.map((a) => `
        <a href="${a.dataUrl || a.url}" download="${escapeHtml(a.name)}" class="d-flex align-items-center gap-3 p-2 rounded-3 text-decoration-none mb-2" style="background:var(--bg-app);">
          <div class="bg-soft-navy" style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <i class="fa-regular fa-file-lines"></i>
          </div>
          <div class="flex-fill">
            <div class="small fw-semibold text-dark">${escapeHtml(a.name)}</div>
            <div class="small text-muted-soft">${a.size ? Math.round(a.size / 1024) + " KB" : ""}</div>
          </div>
          <i class="fa-solid fa-download text-muted-soft"></i>
        </a>`).join("");
    }

    document.getElementById("detailsLoading").classList.add("d-none");
    document.getElementById("detailsContent").classList.remove("d-none");
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load payment details: " + err.message, "danger");
  }
}
