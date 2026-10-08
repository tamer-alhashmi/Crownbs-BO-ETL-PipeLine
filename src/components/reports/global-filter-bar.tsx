"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type GlobalFilterBarProps = {
  from: string;
  to: string;
  property: string;
  properties: string[];
};

export function GlobalFilterBar({
  from,
  to,
  property,
  properties,
}: GlobalFilterBarProps) {
  const router = useRouter();
  const [selectedFrom, setSelectedFrom] = useState(from);
  const [selectedTo, setSelectedTo] = useState(to);
  const [selectedProperty, setSelectedProperty] = useState(property);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    params.set("from", selectedFrom);
    params.set("to", selectedTo);
    if (selectedProperty) params.set("property", selectedProperty);
    else params.delete("property");
    params.set("bookingPage", "1");
    params.set("paymentPage", "1");
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  function clearFilters() {
    setSelectedFrom(from);
    setSelectedTo(to);
    setSelectedProperty(property);
    router.push("/", { scroll: false });
  }

  return (
    <form
      onSubmit={applyFilters}
      className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
    >
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        <span>From</span>
        <input
          type="date"
          value={selectedFrom}
          onChange={(event) => setSelectedFrom(event.target.value)}
          className="h-10 min-w-36 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        <span>To</span>
        <input
          type="date"
          value={selectedTo}
          onChange={(event) => setSelectedTo(event.target.value)}
          className="h-10 min-w-36 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="grid min-w-52 flex-1 gap-1.5 text-xs font-medium text-muted-foreground sm:max-w-80">
        <span>Property / hotel</span>
        <select
          value={selectedProperty}
          onChange={(event) => setSelectedProperty(event.target.value)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All properties</option>
          {properties.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="h-10 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
