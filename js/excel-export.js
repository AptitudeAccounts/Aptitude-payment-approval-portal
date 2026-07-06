/* =========================================================================
   excel-export.js
   Shared helper to generate professional Excel (.xlsx) and CSV exports
   using SheetJS.
   ========================================================================= */

function paymentsToRows(list) {
  return list.map((p) => ({
    "Payment ID": p.paymentId,
    "Supplier Name": p.supplierName,
    "Supplier Code": p.supplierCode,
    "Outlet": p.outlet,
    "Amount": Number(p.amount || 0),
    "Currency": p.currency,
    "Purpose": p.purpose,
    "Payment Type": p.paymentType,
    "Category": p.category,
    "Priority": p.priority,
    "Invoice Number": p.invoiceNumber,
    "Invoice Date": p.invoiceDate,
    "Required Payment Date": p.requiredPaymentDate,
    "Requested By": p.requestedBy ? p.requestedBy.name : "",
    "Status": p.status,
    "Approved By": p.approvedBy ? p.approvedBy.name : "",
    "Remarks": p.remarks || ""
  }));
}

function exportPaymentsExcel(list, filename) {
  const rows = paymentsToRows(list);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");
  XLSX.writeFile(workbook, `${(filename || "payments").replace(/\s+/g, "-").toLowerCase()}.xlsx`);
}

function exportPaymentsCsv(list, filename) {
  const rows = paymentsToRows(list);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(filename || "payments").replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
