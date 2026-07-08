/* =========================================================================
   settings.js
   Admin-only Settings page: company profile, configurable lists (outlets,
   categories, payment types), suppliers directory, and a read-only
   overview of the three predefined portal users.
   ========================================================================= */

let settingsData = { outlets: [], categories: [], paymentTypes: [] };

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth(["Administrator"]);
  } catch (e) {
    return;
  }
  renderShell("settings.html", "Settings", "Configure company details, lists, and suppliers");

  document.querySelectorAll(".nav-pills .nav-link").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav-pills .nav-link").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.add("d-none"));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("d-none");
    });
  });

  if (window.location.hash === "#users") {
    document.getElementById("usersTabLink").click();
  }

  document.getElementById("saveGeneralBtn").addEventListener("click", saveGeneralSettings);
  document.getElementById("saveSupplierBtn").addEventListener("click", saveSupplier);

  await loadSettings();
  await loadSuppliers();
});

async function loadSettings() {
  try {
    const doc = await db.collection("settings").doc("general").get();
    const data = doc.exists ? doc.data() : {};
    settingsData.outlets = data.outlets || ["Louvre", "ARC", "S45 Khalidya", "DGE", "Al Qana", "Al Nahyan"];
    settingsData.categories = data.categories || ["Expense", "Inventory", "Utility", "Salary", "Maintenance", "Tax", "Other"];
    settingsData.paymentTypes = data.paymentTypes || ["Cash", "Bank", "Cheque"];

    document.getElementById("companyName").value = data.companyName || "Aptitude LLC";
    document.getElementById("defaultCurrency").value = data.currency || "AED";
    document.getElementById("companyLogoUrl").value = data.logoURL || "";

    renderLists();
  } catch (err) {
    console.error(err);
    showToast("Error", "Could not load settings: " + err.message, "danger");
  }
}

function renderLists() {
  const render = (key, containerId) => {
    document.getElementById(containerId).innerHTML = settingsData[key].map((item, i) => `
      <span class="file-chip">${escapeHtml(item)} <i class="fa-solid fa-xmark remove-file" onclick="removeListItem('${key}', ${i})"></i></span>`).join("");
  };
  render("outlets", "outletsList");
  render("categories", "categoriesList");
  render("paymentTypes", "paymentTypesList");
}

function addListItem(key, inputId) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  if (!value) return;
  if (!settingsData[key].includes(value)) settingsData[key].push(value);
  input.value = "";
  renderLists();
}

function removeListItem(key, index) {
  settingsData[key].splice(index, 1);
  renderLists();
}

async function saveGeneralSettings() {
  const btn = document.getElementById("saveGeneralBtn");
  btn.disabled = true;
  showSpinner("Saving settings...");
  try {
    await db.collection("settings").doc("general").set({
      companyName: document.getElementById("companyName").value.trim() || "Aptitude LLC",
      currency: document.getElementById("defaultCurrency").value,
      logoURL: document.getElementById("companyLogoUrl").value.trim(),
      outlets: settingsData.outlets,
      categories: settingsData.categories,
      paymentTypes: settingsData.paymentTypes,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    hideSpinner();
    btn.disabled = false;
    showToast("Saved", "Company settings updated successfully.", "success");
  } catch (err) {
    console.error(err);
    hideSpinner();
    btn.disabled = false;
    showToast("Error", "Could not save settings: " + err.message, "danger");
  }
}

function supplierDocIdSettings(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "supplier";
}

async function loadSuppliers() {
  try {
    const snap = await db.collection("suppliers").orderBy("name").limit(50).get();
    const body = document.getElementById("suppliersTableBody");
    if (snap.empty) {
      body.innerHTML = `<tr><td colspan="4" class="text-center text-muted-soft py-4">No suppliers added yet.</td></tr>`;
      return;
    }
    let html = "";
    snap.forEach((doc) => {
      const s = doc.data();
      html += `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.code)}</td>
          <td>${escapeHtml(s.contact || "-")}</td>
          <td><button class="btn-icon-action reject" onclick="deleteSupplier('${doc.id}')"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`;
    });
    body.innerHTML = html;
  } catch (err) {
    console.error(err);
  }
}

async function saveSupplier() {
  const name = document.getElementById("newSupplierName").value.trim();
  const code = document.getElementById("newSupplierCode").value.trim();
  const contact = document.getElementById("newSupplierContact").value.trim();
  if (!name || !code) {
    showToast("Missing Information", "Supplier name and code are required.", "warning");
    return;
  }
  showSpinner("Adding supplier...");
  try {
    const id = supplierDocIdSettings(name);
    await db.collection("suppliers").doc(id).set({
      name,
      nameLower: name.toLowerCase(),
      code,
      contact,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    hideSpinner();
    bootstrap.Modal.getInstance(document.getElementById("supplierAddModal")).hide();
    document.getElementById("newSupplierName").value = "";
    document.getElementById("newSupplierCode").value = "";
    document.getElementById("newSupplierContact").value = "";
    showToast("Added", "Supplier added successfully.", "success");
    loadSuppliers();
  } catch (err) {
    console.error(err);
    hideSpinner();
    showToast("Error", "Could not add supplier: " + err.message, "danger");
  }
}

async function deleteSupplier(id) {
  if (!confirm("Remove this supplier?")) return;
  try {
    await db.collection("suppliers").doc(id).delete();
    showToast("Removed", "Supplier deleted.", "success");
    loadSuppliers();
  } catch (err) {
    showToast("Error", "Could not delete supplier: " + err.message, "danger");
  }
}
