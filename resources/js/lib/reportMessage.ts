// The "Message" that opens a printed report: what the report is, the headline
// figures, and -- only -- the parts that are actually included in this printout.
// English-only on purpose (printed reports are always English, like the PDF and
// Word exports). Mirrors ReportController::buildReportMessage() on the server,
// so keep the two in step.

export type ReportKind = "attendance" | "membership" | "budget" | "inventory";

interface Input {
  type: ReportKind;
  title: string;
  data: any;
  /** Section keys that are included in the printout (any order). */
  sections: string[];
  /** Plain-English description of the filters, e.g. "events held from October 1, 2026 to October 31, 2026". */
  scope: string;
  printedOn: string;
  /** How many events get a full attendee list (attendance "records" section). */
  recordEventCount: number;
}

const peso = (n: unknown) => "₱" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");
const count = (n: unknown, one: string, many: string) => `${num(n)} ${Number(n) === 1 ? one : many}`;

const TOPIC: Record<ReportKind, string> = {
  attendance: "the attendance of residents in the events and activities of the barangay",
  membership: "the enrollment of residents in the membership programs of the barangay",
  budget: "the approved budgets and the recorded expenses of the barangay's events",
  inventory: "the barangay's inventory of equipment and supplies and the condition of each item",
};

const ORDER: Record<ReportKind, string[]> = {
  attendance: ["summary", "charts", "age", "events", "records"],
  membership: ["summary", "memberships"],
  budget: ["summary", "overBudget", "perEvent", "expenses", "topExpenses", "noBudget"],
  inventory: ["summary", "condition", "items"],
};

export function formatReportDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** "events held from X to Y" style scope for the date-ranged reports. */
export function dateRangeScope(from: string, to: string): string {
  if (from && to) return from === to ? `events held on ${formatReportDate(from)}` : `events held from ${formatReportDate(from)} to ${formatReportDate(to)}`;
  if (from) return `events held from ${formatReportDate(from)} onward`;
  if (to) return `events held up to ${formatReportDate(to)}`;
  return "all recorded events";
}

export function buildReportMessage({ type, title, data, sections, scope, printedOn, recordEventCount }: Input): string[] {
  const s = data?.summary ?? {};
  const included = ORDER[type].filter((k) => sections.includes(k));
  const paragraphs: string[] = [
    `This ${title} is prepared by the Barangay Piao office through the Piao Connect system to present ${TOPIC[type]}. It covers ${scope}.`,
  ];

  if (included.includes("summary")) {
    if (type === "attendance") {
      paragraphs.push(
        `${count(s.total_events, "event was", "events were")} held in this period, with ${count(s.total_attended, "recorded attendance", "recorded attendances")} out of ${count(s.total_eligible, "eligible resident", "eligible residents")}, an overall attendance rate of ${s.attendance_percentage ?? 0}%.` +
          (s.average_feedback_rating != null ? ` Residents rated the events ${s.average_feedback_rating} out of 5 on average.` : "")
      );
    } else if (type === "membership") {
      paragraphs.push(`The barangay maintains ${count(s.total_memberships, "membership program", "membership programs")} with a total of ${count(s.total_assignments, "enrolled resident", "enrolled residents")}.`);
    } else if (type === "budget") {
      paragraphs.push(
        `The approved budget of the covered events totals ${peso(s.total_approved_budget)}, against recorded expenses of ${peso(s.total_expenses)} (${s.utilization_percentage ?? 0}% used), leaving ${peso(s.total_remaining)} unspent. ` +
          (Number(s.events_over_budget) > 0
            ? `${count(s.events_over_budget, "event went", "events went")} over budget by a combined ${peso(s.total_over_amount)}.`
            : "No event went over its approved budget.")
      );
    } else {
      paragraphs.push(`The inventory holds ${count(s.total_items, "item", "items")} with a total of ${count(s.total_quantity, "unit", "units")} in stock.`);
    }
  }

  const phrases: Record<ReportKind, Record<string, string>> = {
    attendance: {
      summary: "a summary of the key attendance figures",
      charts: "the number of events per month and the overall attendance rate",
      age: "attendance by age group",
      events: "a per-event breakdown of attendance",
      records: `the attendance list of every resident for ${recordEventCount === 1 ? "the event" : `each of the ${recordEventCount} events`}, showing who was present or absent and the time in and time out`,
    },
    membership: {
      summary: "the total number of memberships and enrolled residents",
      memberships: "the number of enrolled residents and the eligibility requirements of each membership",
    },
    budget: {
      summary: "the budget summary totals",
      overBudget: "the list of events that went over budget",
      perEvent: "the approved budget, spending and remaining balance of every event",
      expenses: "the itemized expenses recorded for each event",
      topExpenses: "the largest expenses",
      noBudget: "the events that have no approved budget",
    },
    inventory: {
      summary: "the total number of items and units",
      condition: "a breakdown of the items by condition",
      items: "the complete list of inventory items with their condition and quantity",
    },
  };
  const parts = included.map((k) => phrases[type][k]);
  if (parts.length > 0) {
    const last = parts.pop() as string;
    const list = parts.length === 0 ? last : parts.length === 1 ? `${parts[0]} and ${last}` : `${parts.join(", ")}, and ${last}`;
    paragraphs.push(`This report contains ${list}.`);
  }

  paragraphs.push(`All figures are taken directly from the records encoded in Piao Connect as of ${printedOn} and are respectfully submitted for the information and guidance of the Barangay Council.`);
  return paragraphs;
}
