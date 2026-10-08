export function parseReportDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const slashDate = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?)?$/i,
  );
  if (slashDate) {
    const [, first, second, year, rawHour = "0", rawMinute = "0", rawSecond = "0", rawMillisecond = "0", meridiem] =
      slashDate;
    const day = Number(first);
    const month = Number(second);
    let hour = Number(rawHour);
    const minute = Number(rawMinute);
    const secondValue = Number(rawSecond);
    const millisecond = Number(rawMillisecond.padEnd(3, "0"));

    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    }

    const date = new Date(
      Date.UTC(Number(year), month - 1, day, hour, minute, secondValue, millisecond),
    );
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      hour > 23 ||
      minute > 59 ||
      secondValue > 59
    ) {
      return null;
    }
    return date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}
