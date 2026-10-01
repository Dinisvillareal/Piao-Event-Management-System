import writeExcelFile from "write-excel-file/browser";

/**
 * Builds a styled, ready-to-hand-off `.xlsx` expense report for a single
 * event's budget. Shared by EventsView and BudgetView so both "Export"
 * buttons produce byte-for-byte the same report layout.
 *
 * Plain CSV can't carry color or column widths, so a report exported that
 * way always looked like raw data someone still had to dress up before
 * sharing it. This builds an actual formatted workbook -- colored header
 * bands, zebra-striped rows, real currency/number formatting, a totals
 * row -- using the Piao brand palette (see tailwind.config.js), so the
 * downloaded file is presentable as-is.
 */

export interface ExpenseReportExpense {
  item: string;
  amount: number | string;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
  receipt_url?: string | null;
}

export interface ExpenseReportOptions {
  eventTitle: string;
  statusLabel: string;
  dateLabel: string;
  location?: string | null;
  approvedBudget: number | null;
  totalSpent: number;
  expenses: ExpenseReportExpense[];
}

// Piao brand palette (tailwind.config.js) -- reused here so the exported
// report reads as part of the same system as the rest of the app instead
// of a generic spreadsheet.
const NAVY = "#0A0E1A";
const WHITE = "#FFFFFF";
const GOLD_TEXT = "#EFCA85";
const GOLD_TINT = "#FCF5E7";
const GOLD_LINE = "#C6953C";
const SAGE_DARK = "#33534E";
const SAGE_TINT = "#EEF4F1";
const BORDER = "#DCEAE5";
const RECEIPT_YES = "#456F68";
const RECEIPT_NO = "#B33B3B";

const COLUMNS = ["Item", "Amount", "Notes", "Recorded By", "Date Recorded", "Receipt"];
const COLUMN_COUNT = COLUMNS.length;
const CURRENCY_FORMAT = '"₱"#,##0.00';

type Cell = Record<string, any>;

const nulls = (count: number): null[] => new Array(count).fill(null);

const bannerRow = (value: string, opts: { fontSize: number; textColor: string; backgroundColor: string; fontWeight?: string }): Cell[] => [
  { value, align: "center", columnSpan: COLUMN_COUNT, ...opts },
  ...nulls(COLUMN_COUNT - 1),
];

interface MetaEntry {
  label: string;
  value: string | number;
  currency?: boolean;
}

const metaRow = (entry: MetaEntry): Cell[] => [
  { value: entry.label, fontWeight: "bold", textColor: SAGE_DARK, backgroundColor: SAGE_TINT, align: "right", borderColor: BORDER, borderStyle: "thin" },
  entry.currency && typeof entry.value === "number"
    ? { value: entry.value, type: Number, format: CURRENCY_FORMAT, backgroundColor: WHITE, columnSpan: COLUMN_COUNT - 1, borderColor: BORDER, borderStyle: "thin" }
    : { value: String(entry.value), backgroundColor: WHITE, columnSpan: COLUMN_COUNT - 1, borderColor: BORDER, borderStyle: "thin" },
  ...nulls(COLUMN_COUNT - 2),
];

export async function exportExpenseReportXlsx(options: ExpenseReportOptions): Promise<void> {
  const { eventTitle, statusLabel, dateLabel, location, approvedBudget, totalSpent, expenses } = options;
  const remaining = approvedBudget !== null ? approvedBudget - totalSpent : null;

  const rows: Cell[][] = [];

  rows.push(bannerRow("EVENT EXPENSE REPORT", { fontSize: 16, fontWeight: "bold", textColor: GOLD_TEXT, backgroundColor: NAVY }));
  rows.push(bannerRow(eventTitle, { fontSize: 13, fontWeight: "bold", textColor: WHITE, backgroundColor: NAVY }));
  rows.push(nulls(COLUMN_COUNT));

  const meta: MetaEntry[] = [{ label: "Status", value: statusLabel }, { label: "Date", value: dateLabel }];
  if (location) meta.push({ label: "Location", value: location });
  meta.push(
    { label: "Approved Budget", value: approvedBudget !== null ? approvedBudget : "N/A", currency: approvedBudget !== null },
    { label: "Total Spent", value: totalSpent, currency: true },
    { label: "Remaining", value: remaining !== null ? remaining : "N/A", currency: remaining !== null },
    { label: "Generated", value: new Date().toLocaleString() },
  );
  meta.forEach((entry) => rows.push(metaRow(entry)));
  rows.push(nulls(COLUMN_COUNT));

  rows.push(
    COLUMNS.map((label) => ({
      value: label,
      fontWeight: "bold",
      textColor: WHITE,
      backgroundColor: NAVY,
      align: label === "Amount" ? "right" : label === "Receipt" ? "center" : "left",
      borderColor: NAVY,
      borderStyle: "thin",
    })),
  );

  expenses.forEach((exp, idx) => {
    const zebra = idx % 2 === 0 ? WHITE : SAGE_TINT;
    const hasReceipt = !!exp.receipt_url;
    const base = { backgroundColor: zebra, borderColor: BORDER, borderStyle: "thin" as const };
    rows.push([
      { ...base, value: exp.item, wrap: true },
      { ...base, value: Number(exp.amount), type: Number, format: CURRENCY_FORMAT, align: "right" },
      { ...base, value: exp.notes || "", wrap: true },
      { ...base, value: exp.recorded_by || "" },
      { ...base, value: new Date(exp.created_at).toLocaleString() },
      { ...base, value: hasReceipt ? "Yes" : "No", align: "center", fontWeight: "bold", textColor: hasReceipt ? RECEIPT_YES : RECEIPT_NO },
    ]);
  });

  const totalBase = { backgroundColor: GOLD_TINT, borderColor: GOLD_LINE, borderStyle: "thin" as const, fontWeight: "bold" };
  rows.push([
    { ...totalBase, value: "TOTAL", textColor: NAVY },
    { ...totalBase, value: totalSpent, type: Number, format: CURRENCY_FORMAT, align: "right", textColor: NAVY },
    { ...totalBase, value: "" },
    { ...totalBase, value: "" },
    { ...totalBase, value: "" },
    { ...totalBase, value: "" },
  ]);

  const columns = [{ width: 30 }, { width: 16 }, { width: 36 }, { width: 20 }, { width: 20 }, { width: 12 }];

  const safeName = eventTitle.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const fileName = `expense_report_${safeName || "event"}.xlsx`;

  // Freeze every row through the table header (2 title rows + spacer +
  // meta rows + spacer + header row) so the column labels stay visible
  // while scrolling through a long expense list.
  const headerRowIndex = 2 + 1 + meta.length + 1; // 0-based index of the table header row
  await writeExcelFile(rows, { columns, stickyRowsCount: headerRowIndex + 1 }).toFile(fileName);
}
