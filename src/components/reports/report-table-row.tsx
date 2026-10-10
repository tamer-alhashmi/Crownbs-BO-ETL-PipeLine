import type { ReactNode } from "react";

export type ReportTableRowProps = {
  rowId: string;
  index: number;
  cells: Array<{ id: string; columnId: string; content: ReactNode }>;
  onClick?: () => void;
  ariaLabel?: string;
};

export function ReportTableRow({ rowId, index, cells, onClick, ariaLabel }: ReportTableRowProps) {
  return (
    <tr
      data-row-id={rowId}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      className={`group transition-colors hover:bg-muted ${onClick ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""} ${index % 2 ? "bg-muted/50" : "bg-card"}`}
    >
      {cells.map((cell) => (
        <td
          key={cell.id}
          className={`border-b border-r border-border px-3 py-3 text-card-foreground last:border-r-0 ${
            cell.columnId === "balance-status"
              ? "w-[100px] min-w-[100px] max-w-[100px] whitespace-normal"
              : cell.columnId === "Booking Notes" || cell.columnId === "Notes"
                ? "w-[130px] max-w-[130px] whitespace-nowrap"
                : "whitespace-nowrap"
          }`}
        >
          {cell.content}
        </td>
      ))}
    </tr>
  );
}
