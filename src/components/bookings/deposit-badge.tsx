import Decimal from "decimal.js";

export function DepositBadge({
  amount,
  status,
}: {
  amount: string;
  status: string;
}) {
  if (new Decimal(amount).isZero()) {
    return <span className="text-muted-foreground">—</span>;
  }

  const paid = status === "Deposit paid";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${paid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
    >
      £{new Decimal(amount).toFixed(2)} {paid ? "Deposit paid" : "Unpaid deposit"}
    </span>
  );
}
