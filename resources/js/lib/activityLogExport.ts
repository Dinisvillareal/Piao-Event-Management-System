import { exportTableXlsx, type TableExportColumn } from "./tableExport";

/**
 * Styled `.xlsx` of the Activity Log Report (the shared table builder in tableExport.ts). The server builds
 * the report (App\\Support\\ActivityLogReport) -- the same rows the screen and the PDF show -- and this
 * draws it. Column keys and order are mirrored there: keep in sync.
 */

export type ActivityExportColumnKey = "no" | "when" | "code" | "staff" | "action" | "module" | "description" | "ip";

export interface ActivityExportColumn extends TableExportColumn {
  key: ActivityExportColumnKey;
}

/** Every column the report can include, in print order. */
export const ACTIVITY_EXPORT_COLUMNS: ActivityExportColumn[] = [
  { key: "no", label: "No.", width: 8, centered: true },
  { key: "when", label: "Date and time", width: 22 },
  { key: "code", label: "Staff code", width: 14 },
  { key: "staff", label: "Staff name", width: 26 },
  { key: "action", label: "Action", width: 12 },
  { key: "module", label: "Module", width: 16 },
  { key: "description", label: "Description", width: 62 },
  { key: "ip", label: "IP address", width: 18 },
];

/**
 * A PDF is limited by rows x columns (the server lays the whole table out in memory); Excel is not. Mirrors
 * ActivityLogReport::PDF_MAX_CELLS -- keep in sync.
 */
/** Most entries one Excel file can hold. Mirrors ActivityLogReport::EXCEL_MAX_ROWS -- keep in sync. */
export const EXCEL_MAX_ROWS = 10000;
export const PDF_MAX_CELLS = 16000;
export const pdfMaxRows = (columnCount: number) => Math.floor(PDF_MAX_CELLS / Math.max(1, columnCount));

/** What the server sends for ?as=json (see ActivityLogReport::build). */
export interface ActivityReportPayload {
  reportTitle: string;
  filterSummary: string;
  message: string[];
  columns: { key: ActivityExportColumnKey; label: string }[];
  rows: string[][];
  total: number;
}

export async function exportActivityXlsx(report: ActivityReportPayload): Promise<void> {
  const byKey = new Map(ACTIVITY_EXPORT_COLUMNS.map((c) => [c.key, c]));
  const columns = report.columns.map((c) => byKey.get(c.key)!).filter(Boolean);
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

  return exportTableXlsx({
    rows: report.rows,
    columns,
    filterLabel: report.filterSummary,
    message: report.message,
    title: "ACTIVITY LOG REPORT",
    sheetName: "Activity Log",
    fileName: `activity-log-report-${stamp}.xlsx`,
    sectionTitle: "ACTIVITY LOG",
    emptyText: "No activity matches the chosen filters.",
    totalText: `Total: ${report.total} ${report.total === 1 ? "entry" : "entries"}`,
  });
}
