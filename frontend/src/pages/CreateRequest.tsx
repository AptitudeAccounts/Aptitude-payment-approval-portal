import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPatch, apiPost } from "../lib/api";

interface PendingAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export default function CreateRequest() {
  const navigate = useNavigate();
  const { requestNumber } = useParams();
  const isEditMode = Boolean(requestNumber);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isEditMode);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState("");

  const [form, setForm] = useState({
    supplierName: "",
    outletName: "",
    invoiceNumber: "",
    serviceOrGoods: "",
    invoiceAmount: "",
    paymentAmount: "",
    currency: "AED",
    reason: "",
  });

  useEffect(() => {
    if (!isEditMode) return;
    apiGet(`/requests/${requestNumber}`)
      .then((r) => {
        setForm({
          supplierName: r.supplier?.name || "",
          outletName: r.outlet?.name || "",
          invoiceNumber: r.invoiceNumber || "",
          serviceOrGoods: r.serviceOrGoods || "",
          invoiceAmount: String(r.invoiceAmount ?? ""),
          paymentAmount: String(r.paymentAmount ?? ""),
          currency: r.currency || "AED",
          reason: r.reason || "",
        });
      })
      .catch((err) => setError(err.message || "Could not load this request."))
      .finally(() => setLoading(false));
  }, [isEditMode, requestNumber]);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachmentError("");
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAttachmentError("Only JPG, PNG, or PDF files are supported.");
      e.target.value = "";
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      setAttachmentError("File is too large — please keep it under 3.5 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const dataBase64 = result.split(",")[1] || "";
      setAttachment({ fileName: file.name, mimeType: file.type, dataBase64 });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isEditMode) {
        await apiPatch(`/requests/${requestNumber}`, {
          supplierName: form.supplierName,
          outletName: form.outletName,
          invoiceNumber: form.invoiceNumber,
          serviceOrGoods: form.serviceOrGoods,
          invoiceAmount: Number(form.invoiceAmount),
          paymentAmount: Number(form.paymentAmount),
          currency: form.currency,
          reason: form.reason,
        });
        navigate(`/approve/${requestNumber}`);
      } else {
        const result = await apiPost("/requests", {
          supplierName: form.supplierName,
          outletName: form.outletName,
          invoiceNumber: form.invoiceNumber,
          serviceOrGoods: form.serviceOrGoods,
          invoiceAmount: Number(form.invoiceAmount),
          paymentAmount: Number(form.paymentAmount),
          currency: form.currency,
          reason: form.reason,
          attachments: attachment ? [attachment] : undefined,
        });
        navigate(`/approve/${result.requestNumber}`);
      }
    } catch (err: any) {
      setError(err.message || "Could not save this request. Please check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/assets/logo.jpg" alt="Aptitude" className="h-8 w-auto" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate">
              {isEditMode ? `Editing ${requestNumber}` : "New submission"}
            </p>
            <h1 className="font-display text-xl font-semibold text-ink">
              {isEditMode ? "Amend Payment Request" : "Payment Request"}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate/15 bg-white p-6 shadow-sm sm:p-8">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Supplier">
              <input
                required
                value={form.supplierName}
                onChange={(e) => update("supplierName", e.target.value)}
                placeholder="e.g. Al Fahim Trading LLC"
                className="input"
              />
            </Field>
            <Field label="Outlet">
              <input
                required
                value={form.outletName}
                onChange={(e) => update("outletName", e.target.value)}
                placeholder="e.g. Downtown Outlet"
                className="input"
              />
            </Field>
            <Field label="Invoice number">
              <input
                required
                value={form.invoiceNumber}
                onChange={(e) => update("invoiceNumber", e.target.value)}
                placeholder="e.g. INV-88213"
                className="input"
              />
            </Field>
            <Field label="Currency">
              <input
                required
                value={form.currency}
                onChange={(e) => update("currency", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Invoice amount">
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.invoiceAmount}
                onChange={(e) => update("invoiceAmount", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Payment amount">
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.paymentAmount}
                onChange={(e) => update("paymentAmount", e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Service / Goods">
            <input
              required
              value={form.serviceOrGoods}
              onChange={(e) => update("serviceOrGoods", e.target.value)}
              placeholder="e.g. Quarterly maintenance contract"
              className="input"
            />
          </Field>

          <Field label="Reason for payment">
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => update("reason", e.target.value)}
              className="input resize-none"
            />
          </Field>

          {!isEditMode && (
            <Field label="Supporting document (JPG, PNG, or PDF — optional)">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                onChange={handleFileChange}
                className="input"
              />
              {attachment && (
                <p className="mt-1 text-xs text-approve">Attached: {attachment.fileName}</p>
              )}
              {attachmentError && (
                <p className="mt-1 text-xs text-reject">{attachmentError}</p>
              )}
            </Field>
          )}

          {!isEditMode && (
            <p className="text-sm text-slate">
              This will be sent to both Siji and Deven for approval automatically.
            </p>
          )}

          {error && <p className="text-sm text-reject">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : isEditMode ? "Save changes" : "Submit for approval"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
    </div>
  );
}
