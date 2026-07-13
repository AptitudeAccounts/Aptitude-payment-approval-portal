import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { apiGet } from "../lib/api";

interface RequestSummary {
  id: string;
  requestNumber: string;
  supplier: { name: string };
  outlet: { name: string };
  paymentAmount: string;
  currency: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "HOLD";
  createdAt: string;
}

const TABS = [
  { key: "PENDING", label: "Pending Approvals" },
  { key: "APPROVED", label: "Approved Payments" },
  { key: "REJECTED", label: "Rejected Payments" },
  { key: "ALL", label: "Payment History" },
] as const;

// Sample data so the screen is browsable before the API is wired up.
const MOCK: RequestSummary[] = [
  { id: "1", requestNumber: "PR-2026-000123", supplier: { name: "Al Fahim Trading" }, outlet: { name: "Downtown Outlet" }, paymentAmount: "18,500.00", currency: "AED", status: "PENDING", createdAt: "2026-07-02" },
  { id: "2", requestNumber: "PR-2026-000122", supplier: { name: "Gulf Logistics LLC" }, outlet: { name: "Marina Outlet" }, paymentAmount: "6,200.00", currency: "AED", status: "PENDING", createdAt: "2026-07-01" },
  { id: "3", requestNumber: "PR-2026-000118", supplier: { name: "Noor Office Supplies" }, outlet: { name: "Head Office" }, paymentAmount: "1,150.00", currency: "AED", status: "APPROVED", createdAt: "2026-06-28" },
  { id: "4", requestNumber: "PR-2026-000109", supplier: { name: "Zenith Facilities Mgmt" }, outlet: { name: "Downtown Outlet" }, paymentAmount: "42,000.00", currency: "AED", status: "REJECTED", createdAt: "2026-06-20" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("PENDING");
  const [requests, setRequests] = useState<RequestSummary[]>(MOCK);
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    navigate("/login");
  }

  useEffect(() => {
    const query = tab === "ALL" ? "" : `?status=${tab}`;
    apiGet(`/requests${query}`)
      .then(setRequests)
      .catch(() => setRequests(tab === "ALL" ? MOCK : MOCK.filter((r) => r.status === tab)));
  }, [tab]);

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-slate/15 bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/logo.jpg" alt="Aptitude" className="h-7 w-auto" />
            <div className="hidden h-6 w-px bg-slate/20 sm:block" />
            <div className="hidden sm:block">
              <p className="font-display text-sm font-semibold text-ink">Payment Approvals</p>
              <p className="text-xs text-slate">{user?.name || "Manager"} · {user?.role || "MANAGER"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(user?.role === "FINANCE" || user?.role === "ADMIN") && (
              <Link
                to="/new"
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
              >
                + New Request
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate/25 px-4 py-2 text-sm font-medium text-slate hover:border-slate/50"
            >
              Log out
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm text-paper">
              {(user?.name || "M").charAt(0)}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                tab === t.key
                  ? "border-ink bg-ink text-paper"
                  : "border-slate/25 bg-white text-slate hover:border-slate/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile: stacked cards */}
        <div className="space-y-3 sm:hidden">
          {requests.map((r) => (
            <Link
              to={`/approve/${r.requestNumber}`}
              key={r.id}
              className="block rounded-xl border border-slate/15 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm text-brass">{r.requestNumber}</span>
                <StatusBadge status={r.status} />
              </div>
              <p className="font-medium text-ink">{r.supplier.name}</p>
              <p className="text-sm text-slate">{r.outlet.name}</p>
              <p className="mt-2 font-mono text-lg font-semibold text-ink">
                {r.currency} {r.paymentAmount}
              </p>
            </Link>
          ))}
        </div>

        {/* Desktop/tablet: table */}
        <div className="hidden overflow-hidden rounded-xl border border-slate/15 bg-white shadow-sm sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate/15 bg-paper text-xs uppercase tracking-wide text-slate">
              <tr>
                <th className="px-5 py-3">Request #</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Outlet</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-slate/10 last:border-0 hover:bg-paper/70"
                  onClick={() => (window.location.href = `/approve/${r.requestNumber}`)}
                >
                  <td className="px-5 py-3 font-mono text-brass">{r.requestNumber}</td>
                  <td className="px-5 py-3 font-medium text-ink">{r.supplier.name}</td>
                  <td className="px-5 py-3 text-slate">{r.outlet.name}</td>
                  <td className="px-5 py-3 font-mono text-ink">{r.currency} {r.paymentAmount}</td>
                  <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-3 text-slate">{r.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {requests.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate">Nothing here yet.</p>
        )}
      </main>
    </div>
  );
}
