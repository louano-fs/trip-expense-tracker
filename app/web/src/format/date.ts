// Date display for trip rows (F2.R5). Times are stored in UTC; this only formats them for the viewer.

/**
 * Formats a UTC ISO 8601 instant as a day, short month and year, e.g. "15 Nov 2026".
 * Pass `timeZone` to choose the zone (an IANA name such as "Asia/Tokyo" or "UTC").
 * Omit it to use the viewer's own zone.
 */
export function formatCreatedDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}
