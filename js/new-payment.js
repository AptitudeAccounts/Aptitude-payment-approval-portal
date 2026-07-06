/* =========================================================================
   new-payment.js
   New Payment Request form: field validation, drag-and-drop attachments,
   Save Draft and Submit for Approval workflows.
   ========================================================================= */

let primaryFiles = [];
let supportFiles = [];
let editingPaymentDocId = null; // set when editing an existing Draft

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth(["Accounts"]);
  } catch (e) {
    return;
  }
  renderShell("new-payment.html", "New Payment Request", "Submit a new payment for approval");

  setupDropZone("dropZonePrimary", "filePrimary", "filePrimaryChips", primaryFiles);
  setupDropZone("dropZoneSupport", "fileSupport", "fileSupportChips", supportFiles);

  document.getElementById("cancelBtn").addEventListener("click", () => {
    window.location.href = "history.html";
  });

  document.getElementById("saveDraftBtn").addEventListener("click", () => submitPayment("Draft"));
  document.getElementById("paymentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitPayment("Submitted");
  });

  // Support editing an existing draft: new-payment.html?edit=<docId>
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (editId) await loadDraftForEdit(editId);
});

function setupDropZone(zoneId, inputId, chipsId, fileArray) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const chipsBox = document.getElementById(chipsId);

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    handleFiles(e.dataTransfer.files, fileArray, chipsBox);
  });
  input.addEventListener("change", () => handleFiles(input.files, fileArray, chipsBox));

  renderChips(fileArray, chipsBox);
}

function handleFiles(fileList, fileArray, chipsBox) {
  Array.from(fileList).forEach((file) => {
    const check = validateFile(file);
    if (!check.valid) {
      showToast("Invalid File", check.reason, "danger");
      return;
    }
    fileArray.push(file);
  });
  renderChips(fileArray, chipsBox);
}

function renderChips(fileArray, chipsBox) {
  chipsBox.innerHTML = fileArray.map((f, i) => `
    <span class="file-chip">
      <i class="fa-regular fa-file"></i> ${escapeHtml(f.name)}
      <i class="fa-solid fa-xmark remove-file" data-index="${i}"></i>
    </span>`).join("");
  chipsBox.querySelectorAll(".remove-file").forEach((btn) => {
    btn.addEventListener("click", () => {
      fileArray.splice(Number(btn.dataset.index), 1);
      renderChips(fileArray, chipsBox);
    });
  });
}

function collectFormData() {
  return {
    supplierName: document.getElementById("supplierName").value.trim(),
    supplierCode: document.getElementById("supplierCode").value.trim(),
    amount: parseFloat(document.getElementById("amount").value || 0),
    currency: document.getElementById("currency").value,
    outlet: document.getElementById("outlet").value,
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
  const form = document.getElementById("paymentForm");
  let valid = true;

  if (targetStatus === "Submitted") {
    // Full validation required before submitting for approval
    const required = ["supplierName", "supplierCode", "amount", "currency", "outlet",
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
  } else {
    // Draft only requires a supplier name at minimum
    const supplierEl = document.getElementById("supplierName");
    if (!supplierEl.value.trim()) {
      supplierEl.classList.add("is-invalid");
      valid = false;
    }
  }
  return valid;
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
    let paymentId = document.getElementById("paymentIdField").dataset.rawId;

    let docRef;
    if (editingPaymentDocId) {
      docRef = db.collection("payments").doc(editingPaymentDocId);
      paymentId = paymentId || (await docRef.get()).data().paymentId;
    } else {
      paymentId = await generatePaymentId();
      docRef = db.collection("payments").doc();
    }

    // Upload new attachments
    const newAttachments = [];
    for (const file of primaryFiles) {
      if (file.uploaded) { newAttachments.push(file.uploaded); continue; }
      newAttachments.push(await uploadAttachment(file, paymentId, "primary"));
    }
    for (const file of supportFiles) {
      if (file.uploaded) { newAttachments.push(file.uploaded); continue; }
      newAttachments.push(await uploadAttachment(file, paymentId, "supporting"));
    }

    const payload = {
      paymentId,
      ...data,
      status: targetStatus === "Submitted" ? "Pending Approval" : "Draft",
      attachments: newAttachments,
      requestedBy: { uid: CURRENT_USER.uid, name: CURRENT_USER.name, email: CURRENT_USER.email },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editingPaymentDocId) {
      const historyEntry = {
        action: targetStatus === "Submitted" ? "Submitted" : "Draft Updated",
        byName: CURRENT_USER.name,
        byRole: CURRENT_USER.role,
        remarks: targetStatus === "Submitted" ? "Request submitted for approval." : "Draft updated.",
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

    if (targetStatus === "Submitted") {
      await createNotification("New Request", `New payment request ${paymentId} submitted by ${CURRENT_USER.name}.`, "Administrator");
      await createNotification("New Request", `New payment request ${paymentId} submitted by ${CURRENT_USER.name}.`, "Operations Manager");
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

async function loadDraftForEdit(docId) {
  showSpinner("Loading draft...");
  try {
    const doc = await db.collection("payments").doc(docId).get();
    if (!doc.exists) { hideSpinner(); return; }
    const p = doc.data();
    if (p.status !== "Draft" || p.requestedBy.uid !== CURRENT_USER.uid) {
      hideSpinner();
      showToast("Not Allowed", "Only your own drafts can be edited.", "warning");
      return;
    }
    editingPaymentDocId = docId;
    document.getElementById("paymentIdField").value = p.paymentId;
    document.getElementById("paymentIdField").dataset.rawId = p.paymentId;
    document.getElementById("supplierName").value = p.supplierName || "";
    document.getElementById("supplierCode").value = p.supplierCode || "";
    document.getElementById("amount").value = p.amount || "";
    document.getElementById("currency").value = p.currency || "AED";
    document.getElementById("outlet").value = p.outlet || "";
    document.getElementById("purpose").value = p.purpose || "";
    document.getElementById("paymentType").value = p.paymentType || "";
    document.getElementById("invoiceNumber").value = p.invoiceNumber || "";
    document.getElementById("invoiceDate").value = p.invoiceDate || "";
    document.getElementById("requiredPaymentDate").value = p.requiredPaymentDate || "";
    document.getElementById("priority").value = p.priority || "Normal";
    document.getElementById("category").value = p.category || "";
    document.getElementById("description").value = p.description || "";
    document.getElementById("remarks").value = p.remarks || "";

    (p.attachments || []).forEach((a) => {
      const fakeFile = { name: a.name, uploaded: a };
      if (a.category === "primary") primaryFiles.push(fakeFile);
      else supportFiles.push(fakeFile);
    });
    renderChips(primaryFiles, document.getElementById("filePrimaryChips"));
    renderChips(supportFiles, document.getElementById("fileSupportChips"));

    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
    showToast("Error", "Could not load draft.", "danger");
  }
}
