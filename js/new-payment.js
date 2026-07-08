/* =========================================================================
   new-payment.js
   New Payment Request form: field validation, live supplier search
   (scales to very large supplier lists — never preloads everything),
   auto-save to the permanent supplier directory, Save Draft and Submit
   for Approval workflows. (Attachment uploads are disabled — Firebase
   Storage is not enabled on the free Spark plan.)
   ========================================================================= */

let editingPaymentDocId = null; // set when editing an existing Draft
let supplierPickedFromList = false;
let supplierSearchTimer = null;

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

/* =========================================================================
   Supplier live search — queries Firestore as the user types instead of
   loading the whole supplier collection, so it stays fast even with
   100,000+ suppliers.
   ========================================================================= */
function setupSupplierAutocomplete() {
  const nameInput = document.getElementById("supplierName");
  const codeInput = document.getElementById("supplierCode");
  const hint = document.getElementById("supplierHint");
  const datalist = document.getElementById("supplierNameList");

  nameInput.addEventListener("input", () => {
    supplierPickedFromList = false;
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
          hint.textContent = "New supplier — it will be saved for future use.";
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

function supplierDocId(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "supplier";
}

async function saveSupplierToDirectory(name, code) {
  if (!name) return;
  try {
    const id = supplierDocId(name);
    await db.collection("suppliers").doc(id).set({
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      code: code ? code.trim() : "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Could not save supplier to directory:", err);
    // Non-fatal: the payment itself still saves even if this fails
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
      attachments: [],
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

    // Save/update this supplier in the permanent directory for future autocomplete
    await saveSupplierToDirectory(data.supplierName, data.supplierCode);

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

    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
    showToast("Error", "Could not load draft.", "danger");
  }
}
