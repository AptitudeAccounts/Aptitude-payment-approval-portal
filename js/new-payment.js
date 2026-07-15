/* =========================================================================
   new-payment.js
   New Payment Request form: field validation, live supplier search,
   auto-assigned sequential supplier codes, small embedded attachments
   (base64 — no Firebase Storage required), edit-before-approval, delete,
   Save Draft and Submit for Approval workflows.
   ========================================================================= */

let editingPaymentDocId = null;
let editingOriginalStatus = null;
let supplierPickedFromList = false;
let supplierSearchTimer = null;
let attachedFiles = [];

const MAX_FILE_SIZE = 700 * 1024;
const MAX_FILES = 3;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth(["Accounts"]);
  } catch (e) {
    return;
  }
  renderShell("new-payment.html", "New Payment Request", "Submit a new payment for approval");

  const outletSelect = document.getElementById("outlet");
  const customOutletRow = document.getElementById("customOutletRow");
  const customOutletInput = document.getElementById("customOutlet");

  outletSelect.addEventListener("change", () => {
    if (outletSelect.value === "Other") {
      customOutletRow.classList.remove("d-none");
      customOutletInput.setAttribute("required", "required");
    } else {
      customOutletRow.classList.add("d-none");
      customOutletInput.removeAttribute("required");
      customOutletInput.value = "";
      customOutletInput.classList.remove("is-invalid");
    }
  });

  setupSupplierAutocomplete();
  setupFileUpload();

  document.getElementById("cancelBtn").addEventListener("click", () => {
    window.location.href = "history.html";
  });

  document.getElementById("saveDraftBtn").addEventListener("click", () => submitPayment("Draft"));
  document.getElementById("paymentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitPayment("Submitted");
  });
  document.getElementById("deletePaymentBtn").addEventListener("click", deleteCurrentPayment);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (editId) await loadDraftForEdit(editId);
});

function setupFileUpload() {
  const zone = document.getElementById("dropZoneFiles");
  const input = document.getElementById("fileInput");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", () => handleFiles(input.files));
}

function handleFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (attachedFiles.length >= MAX_FILES) {
      showToast("Limit Reached", `Maximum ${MAX_FILES} files per payment.`, "warning");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast("File Too Large", `"${file.name}" is over 700KB. Please compress or choose a smaller file.`, "danger");
      return;
    }
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.type)) {
      showToast("Unsupported File", `"${file.name}" must be PDF, PNG, or JPG.`, "danger");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFiles.push({ name: file.name, dataUrl: reader.result, size: file.size, type: file.type });
      renderFileChips();
    };
    reader.readAsDataURL(file);
  });
}

function renderFileChips() {
  const chipsBox = document.getElementById("fileChips");
  chipsBox.innerHTML = attachedFiles.map((f, i) => `
    <span class="file-chip">
      <i class="fa-regular fa-file"></i> ${escapeHtml(f.name)} (${Math.round(f.size / 1024)}KB)
      <i class="fa-solid fa-xmark remove-file" data-index="${i}"></i>
    </span>`).join("");
  chipsBox.querySelectorAll(".remove-file").forEach((btn) => {
    btn.addEventListener("click", () => {
      attachedFiles.splice(Number(btn.dataset.index), 1);
      renderFileChips();
    });
  });
}

function setupSupplierAutocomplete() {
  const nameInput = document.getElementById("supplierName");
  const codeInput = document.getElementById("supplierCode");
  const hint = document.getElementById("supplierHint");
  const datalist = document.getElementById("supplierNameList");

  nameInput.addEventListener("input", () => {
    supplierPickedFromList = false;
    codeInput.value = "";
    const term = nameInput.value.trim();
    clearTimeout(supplierSearchTimer);

    if (!term) {
      datalist.innerHTML = "";
      hint.textContent = "";
      hint.classList.remove("text-success");
      return;
    }

    supplierSearchTimer = setTimeout(async () => {
      try {
        const termLower = term.toLowerCase();
        const snap = await db.collection("suppliers")
          .where("nameLower", ">=", termLower)
          .where("nameLower", "<=", termLower + "\uf8ff")
          .orderBy("nameLower")
          .limit(8)
          .get();

        let exactMatch = null;
        let optionsHtml = "";
        snap.forEach((doc) => {
          const s = doc.data();
          optionsHtml += `<option value="${escapeHtml(s.name)}"></option>`;
          if (s.name.trim().toLowerCase() === termLower) exactMatch = s;
        });
        datalist.innerHTML = optionsHtml;

        if (exactMatch) {
          codeInput.value = exactMatch.code || "";
          hint.textContent = "Existing supplier — code auto-filled.";
          hint.classList.add("text-success");
          supplierPickedFromList = true;
        } else if (snap.empty) {
          hint.textContent = "New supplier — a code will be auto-assigned on save.";
          hint.classList.remove("text-success");
        } else {
          hint.textContent = "Similar suppliers found below — select one, or keep typing to add new.";
          hint.classList.remove("text-success");
        }
      } catch (err) {
        console.error("Supplier search error:", err);
      }
    }, 300);
  });
}

function getSelectedOutlet() {
  const outletSelect = document.getElementById("outlet");
  if (outletSelect.value === "Other") {
    return document.getElementById("customOutlet").value.trim();
  }
  return outletSelect.value;
}

function collectFormData() {
  return {
    supplierName: document.getElementById("supplierName").value.trim(),
    supplierCode: document.getElementById("supplierCode").value.trim(),
    amount: parseFloat(document.getElementById("amount").value || 0),
    currency: document.getElementById("currency").value,
    outlet: getSelectedOutlet(),
    purpose: document.getElementById("purpose").value.trim(),
    paymentType: document.getElementById("paymentType").value,
    invoiceNumber: document.getElementById("invoiceNumber").value.trim(),
    invoiceDate: document.getElementById("invoiceDate").value,
    requiredPaymentDate: document.getElementById("requiredPaymentDate").value,
    priority: document.getElementById("priority").value,
    category: document.getElementById("category").value,
    description: document.getElementById("description").value.trim(),
    remarks: document.getElementById("remarks").value.trim()
  };
}

function validateForm(targetStatus) {
  let valid = true;

  if (targetStatus === "Submitted") {
    const required = ["supplierName", "amount", "currency", "outlet",
      "purpose", "paymentType", "invoiceNumber", "invoiceDate", "requiredPaymentDate", "category"];
    required.forEach((id) => {
      const el = document.getElementById(id);
      if (!el.value || (el.type === "number" && parseFloat(el.value) <= 0)) {
        el.classList.add("is-invalid");
        valid = false;
      } else {
        el.classList.remove("is-invalid");
      }
    });

    const outletSelect = document.getElementById("outlet");
    if (outletSelect.value === "Other") {
      const customOutletInput = document.getElementById("customOutlet");
      if (!customOutletInput.value.trim()) {
        customOutletInput.classList.add("is-invalid");
        valid = false;
      } else {
        customOutletInput.classList.remove("is-invalid");
      }
    }
  } else {
    const supplierEl = document.getElementById("supplierName");
    if (!supplierEl.value.trim()) {
      supplierEl.classList.add("is-invalid");
      valid = false;
    }
  }
  return valid;
}

async function saveSupplierToDirectory(name, code) {
  if (!name) return;
  try {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "supplier";
    await db.collection("suppliers").doc(id).set({
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      code: code ? code.trim() : "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Could not save supplier to directory:", err);
  }
}

async function submitPayment(targetStatus) {
  if (!validateForm(targetStatus)) {
    showToast("Missing Information", "Please complete all required fields highlighted in red.", "warning");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  const draftBtn = document.getElementById("saveDraftBtn");
  submitBtn.disabled = true;
  draftBtn.disabled = true;
  showSpinner(targetStatus === "Draft" ? "Saving draft..." : "Submitting for approval...");

  try {
    const data = collectFormData();

    if (!supplierPickedFromList && !data.supplierCode && data.supplierName) {
      data.supplierCode = await generateSupplierCode();
      document.getElementById("supplierCode").value = data.supplierCode;
    }

    let paymentId = document.getElementById("paymentIdField").dataset.rawId;

    let docRef;
    if (editingPaymentDocId) {
      docRef = db.collection("payments").doc(editingPaymentDocId);
      paymentId = paymentId || (await docRef.get()).data().paymentId;
    } else {
      paymentId = await generatePaymentId();
      docRef = db.collection("payments").doc();
    }

    const payload = {
      paymentId,
      ...data,
      status: targetStatus === "Submitted" ? "Pending Approval" : "Draft",
      attachments: attachedFiles,
      requestedBy: { uid: CURRENT_USER.uid, name: CURRENT_USER.name, email: CURRENT_USER.email },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editingPaymentDocId) {
      const historyEntry = {
        action: targetStatus === "Submitted" ? (editingOriginalStatus === "Pending Approval" ? "Updated & Resubmitted" : "Submitted") : "Draft Updated",
        byName: CURRENT_USER.name,
        byRole: CURRENT_USER.role,
        remarks: targetStatus === "Submitted" ? "Request updated and submitted for approval." : "Draft updated.",
        timestamp: new Date().toISOString()
      };
      payload.approvalHistory = firebase.firestore.FieldValue.arrayUnion(historyEntry);
      await docRef.update(payload);
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.approvalHistory = [{
        action: targetStatus === "Submitted" ? "Submitted" : "Draft Created",
        byName: CURRENT_USER.name,
        byRole: CURRENT_USER.role,
        remarks: targetStatus === "Submitted" ? "Request submitted for approval." : "Saved as draft.",
        timestamp: new Date().toISOString()
      }];
      await docRef.set(payload);
    }

    await saveSupplierToDirectory(data.supplierName, data.supplierCode);

    if (targetStatus === "Submitted") {
      await createNotification("New Request", `Payment request ${paymentId} submitted by ${CURRENT_USER.name}.`, "Administrator");
      await createNotification("New Request", `Payment request ${paymentId} submitted by ${CURRENT_USER.name}.`, "Operations Manager");
    }

    hideSpinner();
    showToast("Success", `Payment request ${targetStatus === "Draft" ? "saved as draft" : "submitted for approval"} successfully.`, "success");
    setTimeout(() => { window.location.href = "history.html"; }, 900);
  } catch (err) {
    console.error(err);
    hideSpinner();
    submitBtn.disabled = false;
    draftBtn.disabled = false;
    showToast("Error", "Could not save payment request: " + err.message, "danger");
  }
}

async function deleteCurrentPayment() {
  if (!editingPaymentDocId) return;
  if (!confirm("Delete this payment request permanently? This cannot be undone.")) return;

  showSpinner("Deleting...");
  try {
    await db.collection("payments").doc(editingPaymentDocId).delete();
    hideSpinner();
    showToast("Deleted", "Payment request deleted.", "success");
    setTimeout(() => { window.location.href = "history.html"; }, 800);
  } catch (err) {
    console.error(err);
    hideSpinner();
    showToast("Error", "Could not delete: " + err.message, "danger");
  }
}

async function loadDraftForEdit(docId) {
  showSpinner("Loading payment...");
  try {
    const doc = await db.collection("payments").doc(docId).get();
    if (!doc.exists) { hideSpinner(); return; }
    const p = doc.data();

    if (!p.requestedBy || p.requestedBy.uid !== CURRENT_USER.uid || !["Draft", "Pending Approval"].includes(p.status)) {
      hideSpinner();
      showToast("Not Allowed", "This payment can no longer be edited (already actioned by an approver).", "warning");
      window.location.href = "history.html";
      return;
    }

    editingPaymentDocId = docId;
    editingOriginalStatus = p.status;

    document.getElementById("deletePaymentBtn").classList.remove("d-none");

    if (p.status === "Pending Approval") {
      document.getElementById("saveDraftBtn").classList.add("d-none");
      document.getElementById("submitBtn").innerHTML = '<i class="fa-solid fa-arrows-rotate me-1"></i>Update & Resubmit';
    }

    document.getElementById("paymentIdField").value = p.paymentId;
    document.getElementById("paymentIdField").dataset.rawId = p.paymentId;
    document.getElementById("supplierName").value = p.supplierName || "";
    document.getElementById("supplierCode").value = p.supplierCode || "";
    if (p.supplierCode) supplierPickedFromList = true;
    document.getElementById("amount").value = p.amount || "";
    document.getElementById("currency").value = p.currency || "AED";

    const outletSelect = document.getElementById("outlet");
    const knownOutlets = Array.from(outletSelect.options).map((o) => o.value);
    if (p.outlet && !knownOutlets.includes(p.outlet)) {
      outletSelect.value = "Other";
      document.getElementById("customOutletRow").classList.remove("d-none");
      document.getElementById("customOutlet").value = p.outlet;
    } else {
      outletSelect.value = p.outlet || "";
    }

    document.getElementById("purpose").value = p.purpose || "";
    document.getElementById("paymentType").value = p.paymentType || "";
    document.getElementById("invoiceNumber").value = p.invoiceNumber || "";
    document.getElementById("invoiceDate").value = p.invoiceDate || "";
    document.getElementById("requiredPaymentDate").value = p.requiredPaymentDate || "";
    document.getElementById("priority").value = p.priority || "Normal";
    document.getElementById("category").value = p.category || "";
    document.getElementById("description").value = p.description || "";
    document.getElementById("remarks").value = p.remarks || "";

    attachedFiles = (p.attachments || []).filter((a) => a.dataUrl);
    renderFileChips();

    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
    showToast("Error", "Could not load payment.", "danger");
  }
}
