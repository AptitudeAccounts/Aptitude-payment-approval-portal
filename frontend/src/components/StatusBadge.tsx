const styles: Record<string, string> = {
  PENDING: "bg-slate/10 text-slate border-slate/30",
  APPROVED: "bg-approve/10 text-approve border-approve/30",
  REJECTED: "bg-reject/10 text-reject border-reject/30",
  HOLD: "bg-hold/10 text-hold border-hold/30",
  CANCELLED: "bg-reject/10 text-reject border-reject/30",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${
        styles[status] || styles.PENDING
      }`}
    >
      {status}
    </span>
  );
}
