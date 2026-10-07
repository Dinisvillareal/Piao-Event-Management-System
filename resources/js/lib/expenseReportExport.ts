import type { Worksheet } from "exceljs";
import { fetchBarangayOfficials } from "./barangayOfficials";

/**
 * Builds a styled, ready-to-hand-off `.xlsx` expense report for a single
 * event's budget. Shared by EventsView and BudgetView so both "Export"
 * buttons produce byte-for-byte the same report layout.
 *
 * The sheet reads like the printed/PDF Reports: the barangay seal and the
 * official letterhead block on top (left-aligned), the report title band,
 * an event-details grid, budget tiles (approved / spent / remaining or over
 * by), the expense table with zebra rows and real currency formatting, a
 * totals row, and the signature lines -- set up to print on A4, one page
 * wide, with the table header repeating on every page.
 *
 * Built with ExcelJS (loaded on demand, so it only costs bandwidth when
 * someone actually exports) because it can embed the seal image, which the
 * previous writer could not.
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
  /** Opening "I. MESSAGE" section. Defaults to true. */
  includeMessage?: boolean;
}

// Piao brand palette (tailwind.config.js), as ARGB for ExcelJS.
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const NAVY = argb("#0A0E1A");
const WHITE = argb("#FFFFFF");
const GOLD_TEXT = argb("#EFCA85");
const GOLD_TINT = argb("#FCF5E7");
const GOLD_LINE = argb("#C6953C");
const GOLD_DARK = argb("#8A6A1F");
const TEAL = argb("#005F63");
const TEAL_LIGHT = argb("#4FBEB0");
const TABLE_HEAD = NAVY; // title band + table header: the original near-black
const SAGE_DARK = argb("#33534E");
const SAGE_TINT = argb("#EEF4F1");
const GREEN_TINT = argb("#E6F5F3");
const RED = argb("#B33B3B");
const RED_TINT = argb("#FDECEC");
const AMBER = argb("#B7791F");
const AMBER_TINT = argb("#FEF3C7");
const BORDER = argb("#DCEAE5");
const MUTED = argb("#667777");
const FAINT = argb("#999999");

const FONT = "Calibri";
const CURRENCY_FORMAT = '"₱"#,##0.00';
const NEAR_LIMIT_PCT = 80;

// The table runs A..G. Column A ("No.") is also where the seal sits in the letterhead, so the seal lines up with the left edge of everything below it.
const COLUMNS = ["No.", "Item", "Amount", "Notes", "Recorded By", "Date Recorded", "Receipt"];
const WIDTHS = [13, 28, 16, 32, 17, 23, 12];
const FIRST_COL = 1; // A
const LAST_COL = 7; // G

const thin = (color: string) => ({ style: "thin" as const, color: { argb: color } });

/** Merge c1..c2 on one row, put `value` in the first cell and apply `style` to every cell so fills/borders render across the merge. */
function band(
  ws: Worksheet,
  row: number,
  c1: number,
  c2: number,
  value: string | number | null,
  style: Record<string, any>
) {
  if (c2 > c1) ws.mergeCells(row, c1, row, c2);
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(row, c);
    if (c === c1 && value !== null) cell.value = value;
    Object.assign(cell, { style: { ...cell.style, ...style } });
  }
}

async function loadSeal(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/logo-removebg-preview.png");
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function exportExpenseReportXlsx(options: ExpenseReportOptions): Promise<void> {
  const { eventTitle, statusLabel, dateLabel, location, approvedBudget, totalSpent, expenses, includeMessage = true } = options;
  const ExcelJS = (await import("exceljs")).default;

  const remaining = approvedBudget !== null ? Math.round((approvedBudget - totalSpent) * 100) / 100 : null;
  const isOver = approvedBudget !== null && totalSpent > approvedBudget;
  const usedPct = approvedBudget ? (totalSpent / approvedBudget) * 100 : null;
  const isNear = !isOver && usedPct !== null && usedPct >= NEAR_LIMIT_PCT;
  const money = (n: number) => `₱${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Signature names: current Barangay Captain / Secretary ("HON. ..."), blank if none is set.
  const officials = await fetchBarangayOfficials();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Piao Connect";
  wb.created = new Date();
  const ws = wb.addWorksheet("Expense Report", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = WIDTHS.map((width) => ({ width }));

  // ── Letterhead (rows 1-7): seal in the gutter, address block left,
  //    system name + generated date on the right, heavy teal rule under.
  const generatedLong = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const generatedFull = new Date().toLocaleString();
  const lh = (row: number, left: string, right: string | null, leftStyle: Record<string, any>, rightStyle: Record<string, any> = {}) => {
    band(ws, row, 2, 4, left, { alignment: { vertical: "middle", horizontal: "left" }, ...leftStyle });
    band(ws, row, 5, 7, right, { alignment: { vertical: "middle", horizontal: "right" }, ...rightStyle });
  };
  lh(1, "REPUBLIC OF THE PHILIPPINES", "PIAO CONNECT", { font: { name: FONT, size: 8, bold: true, color: { argb: "FF222222" } } }, { font: { name: FONT, size: 9, bold: true, color: { argb: TEAL_LIGHT } } });
  const dk = { name: FONT, size: 9, color: { argb: "FF222222" } };
  lh(2, "Province of Zamboanga del Norte, Region IX", "Generated on", { font: dk }, { font: { name: FONT, size: 8, color: { argb: MUTED } } });
  lh(3, "Municipality of President Manuel A. Roxas", generatedLong, { font: dk }, { font: { name: FONT, size: 10, bold: true, color: { argb: TEAL } } });
  lh(4, "BARANGAY PIAO", null, { font: { name: FONT, size: 13, bold: true, color: { argb: "FF000000" } } });
  lh(5, "Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102", null, { font: dk });
  [18, 13, 13, 22, 16, 4, 6].forEach((h, i) => (ws.getRow(i + 1).height = h));
  for (let c = FIRST_COL; c <= LAST_COL; c++) {
    ws.getCell(7, c).border = { bottom: { style: "thick", color: { argb: TEAL } } };
  }
  ws.getRow(8).height = 8;

  // Seal -- embedded image, anchored in the gutter beside the address block.
  const seal = await loadSeal();
  if (seal) {
    const imageId = wb.addImage({ buffer: seal, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.07, row: 0.2 }, ext: { width: 84, height: 84 } });
  }

  // ── Title band
  let r = 9;
  band(ws, r, FIRST_COL, LAST_COL, "EVENT EXPENSE REPORT", {
    font: { name: FONT, size: 16, bold: true, color: { argb: GOLD_TEXT } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: TABLE_HEAD } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws.getRow(r).height = 30;
  r++;
  band(ws, r, FIRST_COL, LAST_COL, eventTitle, {
    font: { name: FONT, size: 13, bold: true, color: { argb: NAVY } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: SAGE_TINT } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
    border: { bottom: thin(BORDER) },
  });
  ws.getRow(r).height = 26;
  r++;
  ws.getRow(r).height = 10;
  r++;

  // ── "I. MESSAGE": says only what this report contains, like the printed report.
  const receiptsCount = expenses.filter((e) => !!e.receipt_url).length;
  const eventBits = [dateLabel, location].filter(Boolean).join(", at ");
  const budgetSentence =
    approvedBudget !== null
      ? `The approved budget is ${money(approvedBudget)}, of which ${money(totalSpent)} (${(usedPct ?? 0).toFixed(1)}%) has been spent, ${
          isOver ? `leaving the event over budget by ${money(totalSpent - approvedBudget)}` : `leaving ${money(approvedBudget - totalSpent)} remaining`
        }.`
      : `No approved budget has been set for this event; ${money(totalSpent)} has been spent so far.`;
  const contents = expenses.length
    ? `This report contains the event details, a summary of the approved budget, total spent and remaining balance, and an itemized list of the ${expenses.length} recorded expense${expenses.length === 1 ? "" : "s"} with their amounts, notes, the person who recorded each, the date recorded and whether a receipt is attached (${receiptsCount} of ${expenses.length} attached).`
    : "This report contains the event details and a summary of the approved budget, total spent and remaining balance. No expenses have been recorded for this event yet.";
  const messageParagraphs = [
    `This Event Expense Report is prepared by the Barangay Piao office through the Piao Connect system to present the expenses recorded for "${eventTitle}"${eventBits ? `, held ${eventBits}` : ""}.`,
    budgetSentence,
    contents,
    `All figures are taken directly from the records encoded in Piao Connect as of ${generatedLong} and are respectfully submitted for the information and guidance of the Barangay Council.`,
  ];
  const sectionHeading = (text: string, before: number) => {
    ws.getRow(r).height = before;
    band(ws, r, FIRST_COL, LAST_COL, text, {
      font: { name: FONT, size: 11.5, bold: true, color: { argb: "FF000000" } },
      alignment: { vertical: "bottom", horizontal: "left", indent: 1 },
    });
    r++;
  };
  if (includeMessage) sectionHeading("I.   MESSAGE", 22);
  (includeMessage ? messageParagraphs : []).forEach((para) => {
    band(ws, r, FIRST_COL, LAST_COL, "      " + para, {
      font: { name: FONT, size: 10.5, color: { argb: argb("#1A1A1A") } },
      alignment: { vertical: "top", horizontal: "justify", indent: 1, wrapText: true },
    });
    const lines = Math.max(1, Math.ceil((para.length + 6) / 125));
    ws.getRow(r).height = lines * 14.5 + 6;
    r++;
  });
  if (includeMessage) {
    sectionHeading("II.   REPORT DETAILS", 34);
    ws.getRow(r).height = 6;
  } else {
    ws.getRow(r).height = 10;
  }
  r++;

  // ── Event details: two label/value pairs per row.
  const receiptsAttached = expenses.filter((e) => !!e.receipt_url).length;
  const statusText = isOver
    ? `Over budget by ${money(totalSpent - (approvedBudget ?? 0))}`
    : isNear
    ? "Near limit"
    : approvedBudget !== null
    ? "Within budget"
    : "No approved budget";
  const statusColor = isOver ? RED : isNear ? AMBER : approvedBudget !== null ? TEAL : MUTED;
  const details: { label: string; value: string; color?: string; bold?: boolean }[] = [
    { label: "Status", value: statusLabel },
    { label: "Date", value: dateLabel },
  ];
  if (location) details.push({ label: "Location", value: location });
  details.push(
    { label: "Expenses", value: `${expenses.length} recorded` },
    { label: "Receipts", value: expenses.length ? `${receiptsAttached} of ${expenses.length} attached` : "—" },
    { label: "Budget Used", value: usedPct !== null ? `${usedPct.toFixed(1)}%` : "N/A" },
    { label: "Budget Status", value: statusText, color: statusColor, bold: true }
  );
  if (details.length % 2) details.push({ label: "", value: "" });

  const labelStyle = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SAGE_DARK } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: SAGE_TINT } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
    border: { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) },
  };
  const valueStyle = (color?: string, bold?: boolean) => ({
    font: { name: FONT, size: 10, bold: !!bold, color: { argb: color ?? argb("#1A1A1A") } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
    border: { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) },
  });
  for (let i = 0; i < details.length; i += 2) {
    const [a, b] = [details[i], details[i + 1]];
    band(ws, r, 1, 2, a.label, labelStyle);
    band(ws, r, 3, 4, a.value, valueStyle(a.color, a.bold));
    band(ws, r, 5, 5, b.label, labelStyle);
    band(ws, r, 6, 7, b.value, valueStyle(b.color, b.bold));
    ws.getRow(r).height = 22;
    r++;
  }
  ws.getRow(r).height = 10;
  r++;

  // ── Budget tiles: approved / spent / remaining (or over by).
  const tileLabel = (fill: string) => ({
    font: { name: FONT, size: 8, bold: true, color: { argb: MUTED } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: fill } },
    alignment: { vertical: "bottom", horizontal: "center" },
    border: { left: { style: "medium" as const, color: { argb: WHITE } }, right: { style: "medium" as const, color: { argb: WHITE } } },
  });
  const tileValue = (fill: string, color: string) => ({
    font: { name: FONT, size: 16, bold: true, color: { argb: color } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: fill } },
    alignment: { vertical: "middle", horizontal: "center" },
    numFmt: CURRENCY_FORMAT,
    border: { left: { style: "medium" as const, color: { argb: WHITE } }, right: { style: "medium" as const, color: { argb: WHITE } } },
  });
  const remainingFill = isOver ? RED_TINT : isNear ? AMBER_TINT : GREEN_TINT;
  const remainingColor = isOver ? RED : isNear ? AMBER : TEAL;
  const tiles: [number, number, string, string | number, string, string][] = [
    [1, 2, "APPROVED BUDGET", approvedBudget !== null ? approvedBudget : "N/A", SAGE_TINT, SAGE_DARK],
    [3, 4, "TOTAL SPENT", totalSpent, GOLD_TINT, GOLD_DARK],
    [5, 7, isOver ? "OVER BUDGET BY" : "REMAINING", remaining !== null ? Math.abs(remaining) : "N/A", remainingFill, remainingColor],
  ];
  tiles.forEach(([c1, c2, label, , fill]) => band(ws, r, c1, c2, label, tileLabel(fill)));
  ws.getRow(r).height = 20;
  r++;
  tiles.forEach(([c1, c2, , value, fill, color]) => band(ws, r, c1, c2, value, tileValue(fill, color)));
  ws.getRow(r).height = 34;
  r++;
  ws.getRow(r).height = 12;
  r++;

  // ── Expense table
  const headerRow = r;
  COLUMNS.forEach((label, i) => {
    const cell = ws.getCell(r, FIRST_COL + i);
    cell.value = label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TABLE_HEAD } };
    cell.alignment = { vertical: "middle", horizontal: label === "Amount" ? "right" : label === "Receipt" || label === "No." ? "center" : "left", indent: label === "Amount" || label === "Receipt" || label === "No." ? 0 : 1 };
    cell.border = { top: thin(TABLE_HEAD), bottom: thin(TABLE_HEAD), left: thin(TABLE_HEAD), right: thin(TABLE_HEAD) };
  });
  ws.getRow(r).height = 24;
  r++;

  expenses.forEach((exp, idx) => {
    const zebra = idx % 2 === 0 ? WHITE : SAGE_TINT;
    const hasReceipt = !!exp.receipt_url;
    const border = { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) };
    const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: zebra } };
    const base = { font: { name: FONT, size: 10 }, fill, border };
    const cells: [any, Record<string, any>][] = [
      [idx + 1, { ...base, font: { name: FONT, size: 10, color: { argb: MUTED } }, alignment: { vertical: "middle", horizontal: "center" } }],
      [exp.item, { ...base, alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true } }],
      [Number(exp.amount), { ...base, numFmt: CURRENCY_FORMAT, alignment: { vertical: "middle", horizontal: "right" } }],
      [exp.notes || "", { ...base, font: { name: FONT, size: 10, color: { argb: MUTED } }, alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true } }],
      [exp.recorded_by || "", { ...base, alignment: { vertical: "middle", horizontal: "left", indent: 1 } }],
      [new Date(exp.created_at).toLocaleString(), { ...base, alignment: { vertical: "middle", horizontal: "left", indent: 1 } }],
      [hasReceipt ? "Yes" : "No", { ...base, font: { name: FONT, size: 10, bold: true, color: { argb: hasReceipt ? TEAL : RED } }, alignment: { vertical: "middle", horizontal: "center" } }],
    ];
    cells.forEach(([value, style], i) => {
      const cell = ws.getCell(r, FIRST_COL + i);
      cell.value = value;
      Object.assign(cell, { style });
    });
    ws.getRow(r).height = 22;
    r++;
  });

  // Totals row (+ the budget line right under it, so the sheet closes the books).
  const totalStyle = {
    font: { name: FONT, size: 11, bold: true, color: { argb: NAVY } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: GOLD_TINT } },
    border: { top: { style: "medium" as const, color: { argb: GOLD_LINE } }, bottom: thin(GOLD_LINE), left: thin(GOLD_LINE), right: thin(GOLD_LINE) },
  };
  for (let c = FIRST_COL; c <= LAST_COL; c++) {
    const alignment = c === 2 ? { vertical: "middle", horizontal: "left", indent: 1 } : c === 3 ? { vertical: "middle", horizontal: "right" } : { vertical: "middle" };
    Object.assign(ws.getCell(r, c), { style: { ...totalStyle, alignment, ...(c === 3 ? { numFmt: CURRENCY_FORMAT } : {}) } });
  }
  ws.getCell(r, 2).value = "TOTAL";
  ws.getCell(r, 3).value = totalSpent;
  ws.getRow(r).height = 24;
  r++;

  // ── Certification: "Prepared by" -> Barangay Secretary, "Noted" -> Barangay Captain, same as the printed reports.
  r += 2;
  const signLabel = { font: { name: FONT, size: 10.5, bold: true, color: { argb: argb("#1A1A1A") } }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } };
  band(ws, r, 1, 3, "Prepared by:", signLabel);
  band(ws, r, 5, 7, "Noted:", signLabel);
  r++;
  ws.getRow(r).height = 48; // room to sign above the lines
  const signName = { font: { name: FONT, size: 12, bold: true, color: { argb: argb("#000000") } }, alignment: { horizontal: "center", vertical: "bottom" } };
  band(ws, r, 1, 3, officials.secretary?.name ?? "", signName);
  band(ws, r, 5, 7, officials.captain?.name ?? "", signName);
  r++;
  const signLine = { border: { top: thin(MUTED) } };
  const signTitle = { ...signLine, font: { name: FONT, size: 10.5, bold: false, color: { argb: argb("#1A1A1A") } }, alignment: { horizontal: "center", vertical: "top" } };
  band(ws, r, 1, 3, "Barangay Secretary", signTitle);
  band(ws, r, 5, 7, "Barangay Captain", signTitle);
  r += 2;
  band(ws, r, FIRST_COL, LAST_COL, `Generated via Piao Connect — Barangay Information Management System · ${generatedFull}`, {
    font: { name: FONT, size: 8, color: { argb: FAINT } },
    alignment: { horizontal: "center" },
  });
  const lastRow = r;

  // ── Print setup: A4, one page wide, header row repeats, page numbers.
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    printArea: `A1:G${lastRow}`,
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = {
    oddFooter: '&L&8Piao Connect · Barangay Piao&R&8Page &P of &N',
  };

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = eventTitle.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const fileName = `expense_report_${safeName || "event"}.xlsx`;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
