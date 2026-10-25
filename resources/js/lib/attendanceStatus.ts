// A resident's attendance row only says what they DID (time in / time out).
// Whether "no record" means Missed depends on the event itself: an event that
// has not started (or is still running) cannot have been missed yet. This is
// the single place that decides it, so the Attendance page, the Dashboard
// counters and the filters all agree.
export type EffectiveAttendanceStatus = "complete" | "incomplete" | "missed" | "upcoming" | "ongoing";

export interface AttendanceLike {
  status?: string;
  timeIn?: string | null;
  timeOut?: string | null;
  eventDate?: string | null;
  eventEnd?: string | null;
}

const ms = (v?: string | null): number => {
  if (!v) return NaN;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? NaN : t;
};

export function attendanceStatus(rec: AttendanceLike, now: number = Date.now()): EffectiveAttendanceStatus {
  if (rec.timeIn || rec.timeOut) {
    return rec.status === "complete" ? "complete" : "incomplete";
  }
  const start = ms(rec.eventDate);
  if (!Number.isNaN(start) && now < start) return "upcoming";
  const endRaw = ms(rec.eventEnd);
  const end = Number.isNaN(endRaw) ? start : endRaw;
  if (!Number.isNaN(start) && now <= end) return "ongoing";
  return "missed";
}

/** Same ordering the Events page uses: this week first (what's still to come,
 *  then what already finished), then later events soonest-first, then older
 *  events most-recent-first. */
export function weekFirstOrder<T extends { eventDate?: string | null; eventEnd?: string | null }>(items: T[], now: number = Date.now()): T[] {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const start = new Date(day); start.setDate(start.getDate() - start.getDay());
  const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
  const wkStart = start.getTime(), wkEnd = end.getTime();
  const st = (x: T) => ms(x.eventDate) || 0;
  const en = (x: T) => { const e = ms(x.eventEnd); return Number.isNaN(e) ? st(x) : e; };
  const bucket = (x: T) => {
    const s = st(x);
    if (s >= wkStart && s <= wkEnd) return en(x) >= now ? 0 : 1;
    return s > wkEnd ? 2 : 3;
  };
  return [...items].sort((a, b) => {
    const ba = bucket(a), bb = bucket(b);
    if (ba !== bb) return ba - bb;
    return ba === 0 || ba === 2 ? st(a) - st(b) : st(b) - st(a);
  });
}
