"use client";

import { useEffect, useState } from "react";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function describeTimeAgo(date: Date, now: Date): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) {
    return "just now";
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** A relative time with the exact date and time on hover, kept fresh every minute. */
export function TimeAgo({ value }: { value: string | Date }) {
  const date = new Date(value);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  const exact = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <time dateTime={date.toISOString()} title={exact} className="whitespace-nowrap">
      {describeTimeAgo(date, now)}
    </time>
  );
}
