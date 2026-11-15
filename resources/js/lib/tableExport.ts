import type { Worksheet } from "exceljs";
import { fetchBarangayOfficials } from "./barangayOfficials";

/**
 * The one styled `.xlsx` table every list export uses (Residents Master List, Activity Log Report, ...) --
 * same letterhead, palette, optional "I. MESSAGE" and signature block as the expense report export.
 * The caller picks which columns to include; rows are plain display strings, one entry per column in the
 * same order, so the Excel file, the PDF and the on-screen list always agree.
 */

export interface TableExportColumn {
  key: string;
  /** Header printed in the exported file (exports are always English). */
  label: string;
  /** Excel column width (characters). */
  width: number;
  centered?: boolean;
}

export interface TableExportOptions {
  rows: string[][];
  columns: TableExportColumn[];
  /** Big navy title band, e.g. "RESIDENTS MASTER LIST". */
  title: string;
  /** Sheet tab name. */
  sheetName: string;
  /** Downloaded file name. */
  fileName: string;
  /** The filters line under the title. */
  filterLabel: string;
  message?: string[];
  /** Heading of the table when a message is shown, e.g. "RESIDENTS LIST". */
  sectionTitle: string;
  /** Row shown when there is nothing to list. */
  emptyText: string;
  /** Closing line, e.g. "Total: 12 residents". */
  totalText: string;
  /** Column printed in bold (the person's name). */
  boldKey?: string;
  /** Columns written as numbers when the text is numeric. */
  numberKeys?: string[];
  /** Last chance to reshape a displayed value (e.g. one membership per line). */
  displayValue?: (key: string, value: string) => string;
}

/** Fewest columns an export may have (the letterhead needs room for the seal + address block). */
export const MIN_EXPORT_COLUMNS = 3;

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const NAVY = argb("#0A0E1A");
const WHITE = argb("#FFFFFF");
const GOLD_TEXT = argb("#EFCA85");
const TEAL = argb("#005F63");
const TEAL_LIGHT = argb("#4FBEB0");
const SAGE_TINT = argb("#EEF4F1");
const BORDER = argb("#DCEAE5");
const MUTED = argb("#667777");
const FAINT = argb("#999999");
const FONT = "Calibri";
const thin = (color: string) => ({ style: "thin" as const, color: { argb: color } });

function band(ws: Worksheet, row: number, c1: number, c2: number, value: string | number | null, style: Record<string, any>) {
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
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * rows: one array per entry, one string per entry of `columns` (already in that order);
 * columns: the selected columns, in print order.
 */
export async function exportTableXlsx(options: TableExportOptions): Promise<void> {
  const { rows, columns, filterLabel, message, title, sheetName, fileName, sectionTitle, emptyText, totalText, boldKey, numberKeys = [], displayValue } = options;
  const ExcelJS = (await import("exceljs")).default;
  const officials = await fetchBarangayOfficials();

  const LAST_COL = columns.length;
  // Few columns would make a narrow sheet that can't hold the letterhead -- widen proportionally.
  const rawTotal = columns.reduce((n, c) => n + c.width, 0);
  const scale = rawTotal < 110 ? 110 / rawTotal : 1;
  const widths = columns.map((c) => Math.round(c.width * scale));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Piao Connect";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }], properties: { defaultRowHeight: 18 } });
  ws.columns = widths.map((width) => ({ width }));

  // ── Letterhead. The seal sits flush at the left; the address block starts a small,
  //    fixed gap to its right. Text can only begin on a column boundary, so it starts in
  //    the first column that doesn't fit inside the seal's width and an indent (Excel
  //    indent step ~9px) closes the remaining distance -- no wide empty gutter.
  const generatedLong = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const generatedFull = new Date().toLocaleString();
  const SEAL_H = 96;
  const SEAL_LEFT = 6;
  const TEXT_GAP = 16;
  const INDENT_PX = 9;
  const colPx = widths.map((w) => Math.round(w * 7 + 5));
  const textStartPx = SEAL_LEFT + SEAL_H + TEXT_GAP; // seal is ~square
  let gutterCols = 0;
  let gutterPx = 0;
  while (gutterCols < LAST_COL - 2 && gutterPx + colPx[gutterCols] <= textStartPx) {
    gutterPx += colPx[gutterCols];
    gutterCols++;
  }
  const TEXT_FROM = gutterCols + 1;
  const textIndent = Math.max(1, Math.min(15, Math.round((textStartPx - gutterPx) / INDENT_PX)));
  let RIGHT_FROM = LAST_COL;
  let tail = widths[LAST_COL - 1];
  for (let j = LAST_COL - 2; j >= TEXT_FROM; j--) {
    if (tail + widths[j] > 40) break;
    tail += widths[j];
    RIGHT_FROM = j + 1;
  }
  RIGHT_FROM = Math.max(RIGHT_FROM, TEXT_FROM + 1 <= LAST_COL ? TEXT_FROM + 1 : LAST_COL);
  // A narrow last column can't hold "November 14, 2026" -- take in the column before it too.
  while (tail < 22 && RIGHT_FROM - 1 > TEXT_FROM) {
    RIGHT_FROM--;
    tail += widths[RIGHT_FROM - 1];
  }
  // The address block needs room to the left of that. When the chosen columns are narrow (e.g. No., Action,
  // Module), widen the last of them instead of clipping the letterhead.
  const LEFT_NEEDED = 66;
  const leftEnd = Math.max(TEXT_FROM, RIGHT_FROM - 1);
  const leftWidth = widths.slice(TEXT_FROM - 1, leftEnd).reduce((n, w) => n + w, 0);
  if (leftWidth < LEFT_NEEDED) {
    widths[leftEnd - 1] += LEFT_NEEDED - leftWidth;
    ws.getColumn(leftEnd).width = widths[leftEnd - 1];
  }
  const lh = (row: number, left: string, right: string | null, leftStyle: Record<string, any>, rightStyle: Record<string, any> = {}) => {
    band(ws, row, TEXT_FROM, Math.max(TEXT_FROM, RIGHT_FROM - 1), left, { alignment: { vertical: "middle", horizontal: "left", indent: textIndent }, ...leftStyle });
    band(ws, row, RIGHT_FROM, LAST_COL, right, { alignment: { vertical: "middle", horizontal: "right", indent: 1 }, ...rightStyle });
  };
  const dk = { name: FONT, size: 11, color: { argb: "FF222222" } };
  lh(1, "REPUBLIC OF THE PHILIPPINES", "PIAO CONNECT", { font: { name: FONT, size: 10, bold: true, color: { argb: "FF222222" } } }, { font: { name: FONT, size: 11, bold: true, color: { argb: TEAL_LIGHT } } });
  lh(2, "Province of Zamboanga del Norte, Region IX", "Generated on", { font: dk }, { font: { name: FONT, size: 10, color: { argb: MUTED } } });
  lh(3, "Municipality of President Manuel A. Roxas", generatedLong, { font: dk }, { font: { name: FONT, size: 12, bold: true, color: { argb: TEAL } } });
  lh(4, "BARANGAY PIAO", null, { font: { name: FONT, size: 16, bold: true, color: { argb: "FF000000" } } });
  lh(5, "Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102", null, { font: dk });
  [22, 17, 17, 28, 19, 4, 8].forEach((h, i) => (ws.getRow(i + 1).height = h));
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(7, c).border = { bottom: { style: "thick", color: { argb: TEAL } } };
  ws.getRow(8).height = 12;

  // Seal: true aspect ratio (read from the PNG header), flush left and vertically
  // centered against the letterhead block (rows 1-6), with exact pixel offsets.
  const seal = await loadSeal();
  if (seal) {
    const dv = new DataView(seal);
    const natW = dv.getUint32(16) || 1;
    const natH = dv.getUint32(20) || 1;
    const sealW = Math.round((SEAL_H * natW) / natH);
    const PX = 9525; // EMU per pixel
    const blockPx = Math.round(([22, 17, 17, 28, 19, 4].reduce((n, v) => n + v, 0) * 96) / 72);
    const topPx = Math.max(4, Math.round((blockPx - SEAL_H) / 2));
    const imageId = wb.addImage({ buffer: seal, extension: "png" });
    ws.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: SEAL_LEFT * PX, nativeRow: 0, nativeRowOff: topPx * PX },
      ext: { width: sealW, height: SEAL_H },
      editAs: "oneCell",
    } as any);
  }

  // ── Title band + filter line
  let r = 9;
  band(ws, r, 1, LAST_COL, title, {
    font: { name: FONT, size: 20, bold: true, color: { argb: GOLD_TEXT } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws.getRow(r).height = 40;
  r++;
  band(ws, r, 1, LAST_COL, filterLabel, {
    font: { name: FONT, size: 12.5, bold: true, color: { argb: NAVY } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: SAGE_TINT } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
    border: { bottom: thin(BORDER) },
  });
  ws.getRow(r).height = 30;
  r++;

  // ── Optional opening message ("I. MESSAGE" ... "II. RESIDENTS LIST"), like the other reports.
  const sectionHeading = (text: string, before: number) => {
    ws.getRow(r).height = before;
    band(ws, r, 1, LAST_COL, text, {
      font: { name: FONT, size: 13, bold: true, color: { argb: "FF000000" } },
      alignment: { vertical: "bottom", horizontal: "left", indent: 1 },
    });
    r++;
  };
  if (message && message.length) {
    const totalWidth = widths.reduce((n, w) => n + w, 0);
    sectionHeading("I.   MESSAGE", 30);
    message.forEach((para) => {
      band(ws, r, 1, LAST_COL, "      " + para, {
        font: { name: FONT, size: 12, color: { argb: argb("#1A1A1A") } },
        alignment: { vertical: "top", horizontal: "justify", indent: 1, wrapText: true },
      });
      const lines = Math.max(1, Math.ceil((para.length + 6) / (totalWidth * 0.95)));
      ws.getRow(r).height = lines * 17 + 8;
      r++;
    });
    sectionHeading(`II.   ${sectionTitle}`, 30);
    ws.getRow(r).height = 8;
    r++;
  } else {
    r++;
  }

  // ── Table
  const headerRow = r;
  columns.forEach((col, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = col.label;
    cell.font = { name: FONT, size: 12, bold: true, color: { argb: GOLD_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: col.centered ? "center" : "left", indent: col.centered ? 0 : 1 };
    cell.border = { top: thin(NAVY), bottom: thin(NAVY), left: thin(NAVY), right: thin(NAVY) };
  });
  ws.getRow(r).height = 36;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow }];
  r++;

  rows.forEach((row, idx) => {
    const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: idx % 2 === 0 ? WHITE : SAGE_TINT } };
    const border = { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) };
    // A caller may reshape a value (e.g. memberships one per line so a long list stays readable); the row grows to fit.
    const display = columns.map((col, i) => {
      const v = row[i] ?? "";
      return displayValue ? displayValue(col.key, v) : v;
    });
    const lineCount = display.reduce((max, v, i) => {
      const chars = Math.max(6, widths[i] - 6);
      const lines = String(v).split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / chars)), 0);
      return Math.max(max, lines);
    }, 1);
    columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      const raw = display[i] ?? "";
      cell.value = numberKeys.includes(col.key) && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
      Object.assign(cell, {
        style: {
          font: { name: FONT, size: 12, color: { argb: col.key === "no" ? MUTED : argb("#1A1A1A") }, bold: col.key === boldKey },
          fill,
          border,
          alignment: { vertical: "middle", horizontal: col.centered ? "center" : "left", indent: col.centered ? 0 : 1, wrapText: true },
        },
      });
    });
    ws.getRow(r).height = Math.max(36, lineCount * 18 + 16);
    r++;
  });
  if (rows.length === 0) {
    band(ws, r, 1, LAST_COL, emptyText, {
      font: { name: FONT, size: 12, italic: true, color: { argb: FAINT } },
      alignment: { horizontal: "center", vertical: "middle" },
    });
    ws.getRow(r).height = 26;
    r++;
  }

  // Total line
  band(ws, r, 1, LAST_COL, totalText, {
    font: { name: FONT, size: 13, bold: true, color: { argb: NAVY } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FCF5E7") } },
    border: { top: { style: "medium", color: { argb: argb("#C6953C") } }, bottom: thin(argb("#C6953C")) },
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws.getRow(r).height = 34;
  r += 3;

  // ── Signatures (Prepared by: Secretary / Noted: Captain)
  let half = Math.max(1, Math.floor(LAST_COL / 2));
  let rightStart = LAST_COL - half + 1;
  // Each signature needs ~26 characters; when the columns are narrow on one side, split by width instead of by count.
  const sumW = (from: number, to: number) => widths.slice(from - 1, to).reduce((n, w) => n + w, 0);
  if (sumW(1, half) < 26 || sumW(LAST_COL - half + 1, LAST_COL) < 26) {
    let best = half;
    let bestGap = Infinity;
    for (let h = 1; h < LAST_COL; h++) {
      if (sumW(1, h) < 26 || sumW(h + 1, LAST_COL) < 26) continue;
      const gap = Math.abs(sumW(1, h) - sumW(h + 1, LAST_COL));
      if (gap < bestGap) {
        best = h;
        bestGap = gap;
      }
    }
    half = best;
    rightStart = half + 1;
  }
  const signLabel = { font: { name: FONT, size: 12.5, bold: true, color: { argb: argb("#1A1A1A") } }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } };
  band(ws, r, 1, half, "Prepared by:", signLabel);
  band(ws, r, rightStart, LAST_COL, "Noted:", signLabel);
  r++;
  ws.getRow(r).height = 54;
  const signName = { font: { name: FONT, size: 14, bold: true, color: { argb: argb("#000000") } }, alignment: { horizontal: "center", vertical: "bottom" } };
  band(ws, r, 1, half, officials.secretary?.name ?? "", signName);
  band(ws, r, rightStart, LAST_COL, officials.captain?.name ?? "", signName);
  r++;
  const signTitle = { border: { top: thin(MUTED) }, font: { name: FONT, size: 12, bold: false, color: { argb: argb("#1A1A1A") } }, alignment: { horizontal: "center", vertical: "top" } };
  band(ws, r, 1, half, "Brgy. Secretary", signTitle);
  band(ws, r, rightStart, LAST_COL, "Barangay Captain", signTitle);
  r += 2;
  band(ws, r, 1, LAST_COL, `Generated via Piao Connect — Barangay Information Management System · ${generatedFull}`, {
    font: { name: FONT, size: 10, color: { argb: FAINT } },
    alignment: { horizontal: "center" },
  });
  const lastRow = r;

  ws.pageSetup = {
    paperSize: 9,
    orientation: LAST_COL <= 5 ? "portrait" : "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    printArea: `A1:${String.fromCharCode(64 + LAST_COL)}${lastRow}`,
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: "&L&8Piao Connect · Barangay Piao&R&8Page &P of &N" };

  const buffer = await wb.xlsx.writeBuffer();
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
