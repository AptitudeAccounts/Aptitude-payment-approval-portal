import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import StampButton from "../components/StampButton";
import { apiGet, apiPost } from "../lib/api";

interface RequestDetail {
  requestNumber: string;
  supplier: { name: string };
  outlet: { name: string };
  invoiceNumber: string;
  serviceOrGoods: string;
  invoiceAmount: string;
  paymentAmount: string;
  currency: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "HOLD" | "CANCELLED";
  deletionRequested: boolean;
  isBatch: boolean;
  lines: { id: string; supplierName: string; invoiceNumber: string; paymentAmount: string }[];
  attachments: { id: string; fileName: string; storageUrl: string }[];
  approvalActions: {
    id: string;
    decision: string;
    remarks?: string;
    decidedAt: string;
    approver: { name: string };
  }[];
}

const MOCK_DETAIL: RequestDetail = {
  requestNumber: "PR-2026-000123",
  supplier: { name: "Al Fahim Trading LLC" },
  outlet: { name: "Downtown Outlet" },
  invoiceNumber: "INV-88213",
  serviceOrGoods: "Quarterly maintenance contract — HVAC systems",
  invoiceAmount: "18,500.00",
  paymentAmount: "18,500.00",
  currency: "AED",
  reason: "Scheduled quarterly maintenance payment per PO-4471.",
  status: "PENDING",
  deletionRequested: false,
  isBatch: false,
  lines: [],
  attachments: [
    { id: "a1", fileName: "Invoice_88213.pdf", storageUrl: "#" },
    { id: "a2", fileName: "PO-4471_signed.pdf", storageUrl: "#" },
  ],
  approvalActions: [],
};

export default function ApprovalScreen() {
  const { requestNumber } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiGet(`/requests/${requestNumber}`)
      .then(setRequest)
      .catch(() => setRequest(MOCK_DETAIL));
  }, [requestNumber]);

  async function decide(decision: "APPROVE" | "REJECT" | "HOLD") {
    setSubmitting(true);
    setMessage("");
    try {
      await apiPost(`/approvals/${requestNumber}/decision`, { decision, remarks });
      setRequest((r) => (r ? { ...r, status: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "HOLD" } : r));
      setMessage(`Recorded as ${decision.toLowerCase()}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not record your decision — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestDeletion() {
    setSubmitting(true);
    setMessage("");
    try {
      await apiPost(`/requests/${requestNumber}/request-deletion`, {});
      setRequest((r) => (r ? { ...r, deletionRequested: true } : r));
      setMessage("Deletion requested — waiting for an approver to confirm.");
    } catch (err: any) {
      setMessage(err.message || "Could not request deletion.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeletion(decision: "CONFIRM" | "DENY") {
    setSubmitting(true);
    setMessage("");
    try {
      const result = await apiPost(`/requests/${requestNumber}/confirm-deletion`, { decision, remarks });
      setRequest((r) => (r ? { ...r, status: result.status, deletionRequested: false } : r));
      setMessage(decision === "CONFIRM" ? "Payment deleted." : "Deletion denied — payment stays approved.");
    } catch (err: any) {
      setMessage(err.message || "Could not process this.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!request) {
    return <div className="flex min-h-screen items-center justify-center text-slate">Loading request…</div>;
  }

  const canDecide = request.status === "PENDING" || request.status === "HOLD";
  const canEdit = canDecide && (user?.role === "FINANCE" || user?.role === "ADMIN");
  const canRequestDeletion =
    request.status === "APPROVED" && !request.deletionRequested && (user?.role === "FINANCE" || user?.role === "ADMIN");
  const canConfirmDeletion =
    request.deletionRequested && (user?.role === "MANAGER" || user?.role === "ADMIN");

  return (
    <div className="min-h-screen bg-paper px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/logo.jpg" alt="Aptitude" className="h-8 w-auto" />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate">Aptitude</p>
              <p className="font-mono text-sm text-brass">{request.requestNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link
                to={`/edit/${request.requestNumber}`}
                className="rounded-full border border-slate/25 px-3 py-1 text-xs font-medium text-slate hover:border-slate/50"
              >
                Edit
              </Link>
            )}
            <StatusBadge status={request.status} />
          </div>
        </div>

        {request.deletionRequested && (
          <div className="mb-4 rounded-lg border border-hold/30 bg-hold/10 px-4 py-3 text-sm text-hold">
            Deletion of this approved payment has been requested and is waiting for approver confirmation.
          </div>
        )}

        {/* Voucher card */}
        <div className="rounded-2xl border border-slate/15 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 font-display text-xl font-semibold text-ink">Payment Request</h1>

          <dl className="grid grid-cols-2 gap-y-5 gap-x-4 text-sm">
            <Field label="Supplier" value={request.supplier.name} />
            <Field label="Outlet" value={request.outlet.name} />
            <Field label="Invoice Number" value={request.invoiceNumber} mono />
            <Field label="Service / Goods" value={request.serviceOrGoods} />
            <Field label="Invoice Amount" value={`${request.currency} ${request.invoiceAmount}`} mono />
            <Field label="Payment Amount" value={`${request.currency} ${request.paymentAmount}`} mono emphasize />
          </dl>

          <div className="mt-5 border-t border-slate/10 pt-5">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate">Reason for Payment</p>
            <p className="text-sm text-ink">{request.reason}</p>
          </div>

          {request.isBatch && request.lines.length > 0 && (
            <div className="mt-6 border-t border-slate/10 pt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate">Batch Breakdown</p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate">
                  <tr>
                    <th className="py-1">Supplier</th>
                    <th className="py-1">Invoice #</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {request.lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate/10">
                      <td className="py-2">{l.supplierName}</td>
                      <td className="py-2 font-mono">{l.invoiceNumber}</td>
                      <td className="py-2 text-right font-mono">{l.paymentAmount}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate/20 font-semibold">
                    <td className="py-2" colSpan={2}>Total</td>
                    <td className="py-2 text-right font-mono">
                      {request.currency}{" "}
                      {request.lines.reduce((sum, l) => sum + parseFloat(l.paymentAmount.replace(/,/g, "")), 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {request.attachments.length > 0 && (
            <div className="mt-6 border-t border-slate/10 pt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate">Supporting Documents</p>
              <ul className="space-y-1">
                {request.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.storageUrl}
                      download={a.fileName}
                      className="text-sm text-brass underline underline-offset-2"
                    >
                      {a.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Decision panel */}
        <div className="mt-6 rounded-2xl border border-slate/15 bg-white p-6 shadow-sm sm:p-8">
          {canConfirmDeletion ? (
            <>
              <p className="mb-4 text-sm text-ink">
                Deletion of this approved payment was requested. Confirm to permanently mark it as deleted, or deny to keep it approved.
              </p>
              <label className="mb-2 block text-sm font-medium text-ink">Remarks (optional)</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                placeholder="Add a note for the record…"
                className="mb-4 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass"
              />
              <div className="flex justify-center gap-6">
                <StampButton label="Confirm Delete" color="reject" onClick={() => confirmDeletion("CONFIRM")} disabled={submitting} />
                <StampButton label="Keep It" color="approve" onClick={() => confirmDeletion("DENY")} disabled={submitting} />
              </div>
              {message && <p className="mt-4 text-center text-sm text-slate">{message}</p>}
            </>
          ) : canDecide ? (
            <>
              <label className="mb-2 block text-sm font-medium text-ink">Remarks (optional)</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder="Add a note for the record…"
                className="mb-6 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass"
              />
              <div className="flex justify-center gap-6">
                <StampButton label="Approve" color="approve" onClick={() => decide("APPROVE")} disabled={submitting} />
                <StampButton label="Hold" color="hold" onClick={() => decide("HOLD")} disabled={submitting} />
                <StampButton label="Reject" color="reject" onClick={() => decide("REJECT")} disabled={submitting} />
              </div>
              {message && <p className="mt-4 text-center text-sm text-slate">{message}</p>}
            </>
          ) : canRequestDeletion ? (
            <>
              <p className="mb-4 text-center text-sm text-slate">
                This payment is approved. If it was submitted in error, you can request it be deleted — Siji or Deven will need to confirm.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={requestDeletion}
                  disabled={submitting}
                  className="rounded-full border border-reject/40 px-5 py-2 text-sm font-medium text-reject hover:bg-reject/5 disabled:opacity-50"
                >
                  Request Deletion
                </button>
              </div>
              {message && <p className="mt-4 text-center text-sm text-slate">{message}</p>}
            </>
          ) : (
            <p className="text-center text-sm text-slate">
              This request has already been <span className="font-medium text-ink">{request.status.toLowerCase()}</span>.
              {" "}No further action is needed.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate">
          Every decision is recorded with your name, timestamp, IP address, and device for audit purposes.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd
        className={`mt-0.5 ${mono ? "font-mono" : ""} ${
          emphasize ? "text-lg font-semibold text-ink" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
