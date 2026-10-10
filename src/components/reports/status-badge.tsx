export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLocaleLowerCase();
  const className =
    normalized === "settled" ||
    normalized === "prepaid" ||
    normalized === "confirmed" ||
    normalized === "checked in" ||
    normalized === "checked out"
      ? "bg-success/10 text-success"
      : normalized === "pending" ||
          normalized === "awaiting payment" ||
          normalized === "payment on arrival"
        ? "bg-warning/10 text-warning"
        : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${className}`}>
      {status}
    </span>
  );
}
