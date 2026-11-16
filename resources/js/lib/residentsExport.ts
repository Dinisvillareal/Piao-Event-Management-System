import { exportTableXlsx, MIN_EXPORT_COLUMNS, type TableExportColumn } from "./tableExport";

/**
 * Styled `.xlsx` of the staff Residents Master List (the shared table builder in tableExport.ts).
 * The caller picks which columns to include (see RESIDENT_EXPORT_COLUMNS); rows are plain
 * display strings, one entry per column in the same order, so the Excel file,
 * the PDF and the on-screen list always agree.
 */

export { MIN_EXPORT_COLUMNS };

export type ResidentExportColumnKey = "no" | "id" | "name" | "gender" | "age" | "contact" | "address" | "household" | "membership";

export interface ResidentExportColumn extends TableExportColumn {
  key: ResidentExportColumnKey;
}

/** Every column the export can include, in print order. Keep in sync with ResidentExportController::COLUMNS (PDF). */
export const RESIDENT_EXPORT_COLUMNS: ResidentExportColumn[] = [
  { key: "no", label: "No.", width: 8, centered: true },
  { key: "id", label: "ID Number", width: 16 },
  { key: "name", label: "Resident", width: 40 },
  { key: "gender", label: "Gender", width: 12, centered: true },
  { key: "age", label: "Age", width: 9, centered: true },
  { key: "contact", label: "Contact", width: 22 },
  { key: "address", label: "Address", width: 44 },
  { key: "household", label: "Household", width: 26 },
  { key: "membership", label: "Membership", width: 38 },
];

/**
 * @param rows          one array per resident, one string per entry of `columns` (already in that order)
 * @param columns       the selected columns, in print order
 */
export async function exportResidentsXlsx(options: { rows: string[][]; columns: ResidentExportColumn[]; filterLabel: string; message?: string[] }): Promise<void> {
  const { rows, columns, filterLabel, message } = options;
  return exportTableXlsx({
    rows,
    columns,
    filterLabel,
    message,
    title: "RESIDENTS MASTER LIST",
    sheetName: "Residents",
    fileName: "residents-master-list.xlsx",
    sectionTitle: "RESIDENTS LIST",
    emptyText: "No residents match the current filter.",
    totalText: `Total: ${rows.length} resident${rows.length === 1 ? "" : "s"}`,
    boldKey: "name",
    numberKeys: ["age"],
    // Memberships go one per line so a long list stays readable.
    displayValue: (key, v) => (key === "membership" && v && v !== "Not a member" ? v.split(", ").join("\n") : v),
  });
}
