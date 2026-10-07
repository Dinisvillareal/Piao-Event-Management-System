export interface EventTimingInput {
  id: number | string;
  title: string;
  date?: string;
  event_start?: string;
  event_end?: string;
  call_time_start?: string;
  call_time_end?: string;
}

export type EventStatusLabel = "Upcoming" | "Ongoing" | "Past";

// Colors / accents for the three event statuses (shared by the Budget page's
// event list and the budget workspace header).
export const STATUS_META = {
  Ongoing: { tab: "ongoing" as const, accent: "bg-gold-400", dot: "bg-gold-400", text: "text-gold-300", hint: "sectionOngoingHint" },
  Upcoming: { tab: "upcoming" as const, accent: "bg-[#4FBEB0]", dot: "bg-[#4FBEB0]", text: "text-[#7DD8CB]", hint: "sectionUpcomingHint" },
  Past: { tab: "past" as const, accent: "bg-white/25", dot: "bg-white/40", text: "text-white/45", hint: "sectionPastHint" },
};

/**
 * Event timing helpers (Upcoming / Ongoing / Past, friendly clock, "starts
 * in 3 days" labels) shared by the Budget page and the budget workspace so
 * both classify an event exactly the same way.
 */
export function makeEventTiming(t: (key: string) => string) {
  // Friendly 12-hour clock for the event list and header.
  const formatTimeFriendly = (value?: string | null): string => {
    const d = parseEventDateTime(value ?? undefined);
    if (!d) return "";
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  // Same Upcoming/Ongoing/Past classification as Events & Attendance --
  // once an event is Ongoing or Past, its recorded expenses are locked
  // from further edits/deletes, same idea as the event record itself.
  const parseEventDateTime = (value?: string | null): Date | null => {
    if (!value) return null;
    const iso = value.includes("T") ? value : value.replace(" ", "T");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  };

  // Dark-palette equivalents of the same three statuses, same teal/gold/
  // neutral mapping used for event status pills everywhere else (Events
  // list/detail).
  const getEventStatus = (event: EventTimingInput): { label: "Upcoming" | "Ongoing" | "Past"; color: string; dot: string } => {
    const now = new Date();
    const upcoming = { label: "Upcoming" as const, color: "bg-[#4FBEB0]/15 text-[#7DD8CB]", dot: "bg-[#4FBEB0]" };
    const ongoing = { label: "Ongoing" as const, color: "bg-gold-400/15 text-gold-300", dot: "bg-gold-400" };
    const past = { label: "Past" as const, color: "bg-white/10 text-white/50", dot: "bg-white/40" };

    const start = parseEventDateTime(event.event_start) ?? parseEventDateTime(event.date);
    if (!start) return upcoming;

    let end = parseEventDateTime(event.event_end) ?? parseEventDateTime(event.call_time_end);
    if (!end) {
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    }

    if (now < start) return upcoming;
    if (now > end) return past;
    return ongoing;
  };

  const eventStatusLabel = (label: "Upcoming" | "Ongoing" | "Past") =>
    label === "Upcoming" ? t("upcomingBadge") : label === "Ongoing" ? t("ongoingBadge") : t("pastBadge");

  // Start/end of an event, with the same end-of-day fallback getEventStatus uses.
  const eventWindow = (event: EventTimingInput): { start: Date | null; end: Date | null } => {
    const start = parseEventDateTime(event.event_start) ?? parseEventDateTime(event.date);
    if (!start) return { start: null, end: null };
    let end = parseEventDateTime(event.event_end) ?? parseEventDateTime(event.call_time_end);
    if (!end) {
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  // "3 days", "5 hr", "12 min" -- rounded down, never "0".
  const durationLabel = (ms: number) => {
    const mins = Math.max(1, Math.floor(ms / 60000));
    if (mins < 60) return t("relMinutes").replace("{n}", String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("relHours").replace("{n}", String(hours));
    const days = Math.floor(hours / 24);
    if (days < 60) return t(days === 1 ? "relDaysOne" : "relDaysMany").replace("{n}", String(days));
    return t("relMonths").replace("{n}", String(Math.floor(days / 30)));
  };

  // Live status line for an event ("Starts in 3 days", "Happening now", "Ended 2 days ago").
  // The page re-renders every second (nowTick), so this stays current without a refresh.
  const relativeLabel = (event: EventTimingInput, status: "Upcoming" | "Ongoing" | "Past"): string => {
    const { start, end } = eventWindow(event);
    if (!start || !end) return "";
    const now = Date.now();
    if (status === "Upcoming") return t("relStartsIn").replace("{t}", durationLabel(start.getTime() - now));
    if (status === "Ongoing") return `${t("relHappeningNow")} · ${t("relEndsIn").replace("{t}", durationLabel(end.getTime() - now))}`;
    return t("relEndedAgo").replace("{t}", durationLabel(now - end.getTime()));
  };


  return { formatTimeFriendly, parseEventDateTime, getEventStatus, eventStatusLabel, eventWindow, durationLabel, relativeLabel };
}
