import type { ReactNode } from "react";

export type ReportTableRowProps = {
  rowId: string;
  index: number;
  cells: Array<{ id: string; content: ReactNode }>;
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
          className="whitespace-nowrap border-b border-r border-border px-3 py-3 text-card-foreground last:border-r-0"
        >
          {cell.content}
        </td>
      ))}
    </tr>
  );
}
