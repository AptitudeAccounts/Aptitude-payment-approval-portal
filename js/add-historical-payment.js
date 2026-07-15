/* =========================================================================
   add-historical-payment.js
   Admin-only: record a payment that was already completed in the past.
   Skips the approval workflow entirely — saved directly with status
   "Paid" and a chosen historical payment date.
   ========================================================================= */

let supplierPickedFromList = false;
let supplierSearchTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth(["Administrator"]);
  } catch (e) {
    return;
  }
  renderShell("add-historical-payment.html", "Add Historical Payment", "Record a payment that was already completed in the past");

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
    }
  });

  setupSupplierAutocomplete();

  document.getElementById("cancelBtn").addEventListener("click", () => {
    window.location.href = "history.html";
  });

  document.getElementById("historicalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitHistoricalPayment();
  });
});

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
          supplierPickedFromList = true;
        } else {
          hint.textContent = "New supplier — a code will be auto-assigned on save.";
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

function validateForm() {
  let valid = true;
  const required = ["supplierName", "amount", "currency", "outlet", "purpose",
    "paymentType", "invoiceNumber", "category", "paidDate"];
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

async function submitHistoricalPayment() {
  if (!validateForm()) {
    showToast("Missing Information", "Please complete all required fields highlighted in red.", "warning");
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  showSpinner("Recording historical payment...");

  try {
    const supplierName = document.getElementById("supplierName").value.trim();
    let supplierCode = document.getElementById("supplierCode").value.trim();

    if (!supplierPickedFromList && !supplierCode && supplierName) {
      supplierCode = await generateSupplierCode();
      document.getElementById("supplierCode").value = supplierCode;
    }

    const paidDateValue = document.getElementById("paidDate").value; // yyyy-mm-dd
    const paidDateObj = new Date(paidDateValue + "T12:00:00");

    const paymentId = await generatePaymentId();
    const docRef = db.collection("payments").doc();

    const payload = {
      paymentId,
      supplierName,
      supplierCode,
      amount: parseFloat(document.getElementById("amount").value),
      currency: document.getElementById("currency").value,
      outlet: getSelectedOutlet(),
      purpose: document.getElementById("purpose").value.trim(),
      paymentType: document.getElementById("paymentType").value,
      invoiceNumber: document.getElementById("invoiceNumber").value.trim(),
      invoiceDate: paidDateValue,
      requiredPaymentDate: paidDateValue,
      priority: "Normal",
      category: document.getElementById("category").value,
      description: "",
      remarks: document.getElementById("remarks").value.trim() || "Historical entry — payment made prior to portal record.",
      status: "Paid",
      attachments: [],
      requestedBy: { uid: CURRENT_USER.uid, name: CURRENT_USER.name, email: CURRENT_USER.email },
      approvedBy: { uid: CURRENT_USER.uid, name: CURRENT_USER.name, role: CURRENT_USER.role },
      approvedAt: firebase.firestore.Timestamp.fromDate(paidDateObj),
      paidBy: { uid: CURRENT_USER.uid, name: CURRENT_USER.name, role: CURRENT_USER.role },
      paidAt: firebase.firestore.Timestamp.fromDate(paidDateObj),
      createdAt: firebase.firestore.Timestamp.fromDate(paidDateObj),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvalHistory: [{
        action: "Paid",
        byName: CURRENT_USER.name,
        byRole: CURRENT_USER.role,
        remarks: "Recorded as a historical payment (entered retroactively).",
        timestamp: paidDateObj.toISOString()
      }]
    };

    await docRef.set(payload);
    await saveSupplierToDirectory(supplierName, supplierCode);

    hideSpinner();
    showToast("Success", `Historical payment ${paymentId} recorded successfully.`, "success");
    setTimeout(() => { window.location.href = "history.html"; }, 900);
  } catch (err) {
    console.error(err);
    hideSpinner();
    submitBtn.disabled = false;
    showToast("Error", "Could not save historical payment: " + err.message, "danger");
  }
}
