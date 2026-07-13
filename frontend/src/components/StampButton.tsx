interface Props {
  label: string;
  color: "approve" | "reject" | "hold";
  onClick: () => void;
  disabled?: boolean;
}

const colorMap = {
  approve: "text-approve hover:bg-approve/10",
  reject: "text-reject hover:bg-reject/10",
  hold: "text-hold hover:bg-hold/10",
};

export default function StampButton({ label, color, onClick, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`stamp flex h-24 w-24 flex-col items-center justify-center font-display text-sm font-semibold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40 ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}
