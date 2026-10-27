import type { Worksheet } from "exceljs";

/**
 * Styled `.xlsx` for the Reports & Analytics "CSV / Excel" download. It uses
 * the same look as the Event Expense Report workbook (expenseReportExport.ts):
 * seal + barangay letterhead, dark title band with gold text, "I. MESSAGE",
 * "II. REPORT DETAILS" grid, tinted stat tiles, a zebra table with a TOTAL row
 * and the signature lines -- for all four report types. The server decides the
 * columns / rows / tiles (ReportController::buildTabularExport); this file
 * only draws them.
 */

export type ReportColumnFormat = "text" | "int" | "money" | "percent" | "rating";

export interface ReportExcelPayload {
  type: string;
  reportTitle: string;
  filterSummary: string;
  printedOn: string;
  generatedAt: string;
  message: string[];
  officials?: { captain?: { name: string } | null; secretary?: { name: string } | null } | null;
  tiles: { label: string; value: number; format: ReportColumnFormat; tone: "sage" | "gold" | "green" | "red" }[];
  details: { label: string; value: string }[];
  columns: { label: string; format: ReportColumnFormat; sum: boolean }[];
  rows: (string | number | null)[][];
  totals: (string | number | null)[];
}

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const NAVY = argb("#0A0E1A");
const WHITE = argb("#FFFFFF");
const GOLD_TEXT = argb("#EFCA85");
const GOLD_TINT = argb("#FCF5E7");
const GOLD_LINE = argb("#C6953C");
const GOLD_DARK = argb("#8A6A1F");
const TEAL = argb("#005F63");
const TEAL_LIGHT = argb("#4FBEB0");
const SAGE_DARK = argb("#33534E");
const SAGE_TINT = argb("#EEF4F1");
const GREEN_TINT = argb("#E6F5F3");
const RED = argb("#B33B3B");
const RED_TINT = argb("#FDECEC");
const BORDER = argb("#DCEAE5");
const MUTED = argb("#667777");
const FAINT = argb("#999999");
const INK = argb("#1A1A1A");

const FONT = "Calibri";
const NUM_FORMAT: Record<ReportColumnFormat, string | undefined> = {
  text: undefined,
  int: "#,##0",
  money: '"₱"#,##0.00',
  percent: '0.0"%"',
  rating: "0.0",
};

const TONES = {
  sage: { fill: SAGE_TINT, color: SAGE_DARK },
  gold: { fill: GOLD_TINT, color: GOLD_DARK },
  green: { fill: GREEN_TINT, color: TEAL },
  red: { fill: RED_TINT, color: RED },
};

const thin = (color: string) => ({ style: "thin" as const, color: { argb: color } });
const solid = (color: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: color } });

/** Merge c1..c2 on one row, set the value in the first cell and the style on every cell so fills/borders show across the merge. */
function band(ws: Worksheet, row: number, c1: number, c2: number, value: string | number | null, style: Record<string, any>) {
  if (c2 > c1) ws.mergeCells(row, c1, row, c2);
  for (let c = c1; c <= c2; c++) {
    const cell = ws.getCell(row, c);
    if (c === c1 && value !== null) cell.value = value;
    Object.assign(cell, { style: { ...cell.style, ...style } });
  }
}

/** Split columns 1..total into `parts` consecutive [start, end] ranges (any extra columns go to the later parts). */
function split(total: number, parts: number): [number, number][] {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  const out: [number, number][] = [];
  let start = 1;
  for (let i = 0; i < parts; i++) {
    const size = base + (i >= parts - extra ? 1 : 0);
    out.push([start, start + size - 1]);
    start += size;
  }
  return out;
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

export async function buildReportWorkbookBlob(p: ReportExcelPayload): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  // A leading "No." column (13 wide) is the gutter the seal sits in, so the seal lines up with the address block beside it, like the Event Expense Report.
  const cols = [{ label: "No.", format: "int" as ReportColumnFormat, sum: false }, ...p.columns];
  const dataRows = p.rows.map((row, i) => [i + 1, ...row]);
  const totalsRow = [null, ...p.totals];
  const W = Math.max(cols.length, 6); // layout width in columns

  const wb = new ExcelJS.Workbook();
  wb.creator = "Piao Connect";
  wb.created = new Date();
  const ws = wb.addWorksheet(p.reportTitle.replace(/\s*report\s*$/i, "").slice(0, 31) || "Report", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });

  // Column widths follow the longest value in each column.
  const widths: number[] = [];
  for (let i = 0; i < W; i++) {
    if (i >= cols.length) {
      widths.push(14);
      continue;
    }
    if (i === 0) {
      widths.push(13);
      continue;
    }
    const longest = Math.max(cols[i].label.length, ...dataRows.map((r) => String(r[i] ?? "").length), 0);
    widths.push(Math.min(40, Math.max(i === 1 ? 14 : 12, longest + 3)));
  }
  ws.columns = widths.map((width) => ({ width }));
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  // ── Letterhead: seal in the gutter, address block left, system name + date right, teal rule under.
  const leftEnd = Math.max(3, W - 2);
  const generatedLong = p.printedOn;
  const lh = (row: number, left: string, right: string | null, leftStyle: Record<string, any>, rightStyle: Record<string, any> = {}) => {
    band(ws, row, 2, leftEnd, left, { alignment: { vertical: "middle", horizontal: "left" }, ...leftStyle });
    band(ws, row, leftEnd + 1, W, right, { alignment: { vertical: "middle", horizontal: "right" }, ...rightStyle });
  };
  const dk = { name: FONT, size: 9, color: { argb: "FF222222" } };
  lh(1, "REPUBLIC OF THE PHILIPPINES", "PIAO CONNECT", { font: { name: FONT, size: 8, bold: true, color: { argb: "FF222222" } } }, { font: { name: FONT, size: 9, bold: true, color: { argb: TEAL_LIGHT } } });
  lh(2, "Province of Zamboanga del Norte, Region IX", "Generated on", { font: dk }, { font: { name: FONT, size: 8, color: { argb: MUTED } } });
  lh(3, "Municipality of President Manuel A. Roxas", generatedLong, { font: dk }, { font: { name: FONT, size: 10, bold: true, color: { argb: TEAL } } });
  lh(4, "BARANGAY PIAO", null, { font: { name: FONT, size: 13, bold: true, color: { argb: "FF000000" } } });
  lh(5, "Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102", null, { font: dk });
  [18, 13, 13, 22, 16, 4, 6].forEach((h, i) => (ws.getRow(i + 1).height = h));
  for (let c = 1; c <= W; c++) ws.getCell(7, c).border = { bottom: { style: "thick", color: { argb: TEAL } } };
  ws.getRow(8).height = 8;

  const seal = await loadSeal();
  if (seal) {
    const imageId = wb.addImage({ buffer: seal, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.07, row: 0.2 }, ext: { width: 84, height: 84 } });
  }

  // ── Title band + scope line
  let r = 9;
  band(ws, r, 1, W, p.reportTitle.toUpperCase(), {
    font: { name: FONT, size: 16, bold: true, color: { argb: GOLD_TEXT } },
    fill: solid(NAVY),
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws.getRow(r).height = 30;
  r++;
  band(ws, r, 1, W, p.filterSummary, {
    font: { name: FONT, size: 12, bold: true, color: { argb: NAVY } },
    fill: solid(SAGE_TINT),
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
    border: { bottom: thin(BORDER) },
  });
  ws.getRow(r).height = 26;
  r++;
  ws.getRow(r).height = 10;
  r++;

  // ── I. MESSAGE (only when it was included)
  const heading = (text: string, before: number) => {
    ws.getRow(r).height = before;
    band(ws, r, 1, W, text, {
      font: { name: FONT, size: 11.5, bold: true, color: { argb: "FF000000" } },
      alignment: { vertical: "bottom", horizontal: "left", indent: 1 },
    });
    r++;
  };
  const hasMessage = p.message.length > 0;
  if (hasMessage) {
    heading("I.   MESSAGE", 22);
    p.message.forEach((para) => {
      band(ws, r, 1, W, "      " + para, {
        font: { name: FONT, size: 10.5, color: { argb: INK } },
        alignment: { vertical: "top", horizontal: "justify", indent: 1, wrapText: true },
      });
      const lines = Math.max(1, Math.ceil((para.length + 6) / (totalWidth * 0.95)));
      ws.getRow(r).height = lines * 14.5 + 6;
      r++;
    });
    heading("II.   REPORT DETAILS", 34);
  } else {
    heading("REPORT DETAILS", 14);
  }
  ws.getRow(r).height = 6;
  r++;

  // ── Details grid: the scope runs full width, the rest are label/value pairs.
  const labelStyle = {
    font: { name: FONT, size: 10, bold: true, color: { argb: SAGE_DARK } },
    fill: solid(SAGE_TINT),
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
    border: { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) },
  };
  const valueStyle = {
    font: { name: FONT, size: 10, color: { argb: INK } },
    fill: solid(WHITE),
    alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
    border: { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) },
  };
  const seg = split(W, 4);
  const details = [...p.details];
  const scope = details.find((d) => d.label === "Scope");
  if (scope) {
    band(ws, r, seg[0][0], seg[0][1], scope.label, labelStyle);
    band(ws, r, seg[1][0], W, scope.value, valueStyle);
    ws.getRow(r).height = Math.max(22, Math.ceil(scope.value.length / (totalWidth * 0.6)) * 16 + 6);
    r++;
  }
  const rest = details.filter((d) => d !== scope);
  if (rest.length % 2) rest.push({ label: "", value: "" });
  for (let i = 0; i < rest.length; i += 2) {
    const [a, b] = [rest[i], rest[i + 1]];
    band(ws, r, seg[0][0], seg[0][1], a.label, labelStyle);
    band(ws, r, seg[1][0], seg[1][1], a.value, valueStyle);
    band(ws, r, seg[2][0], seg[2][1], b.label, labelStyle);
    band(ws, r, seg[3][0], seg[3][1], b.value, valueStyle);
    ws.getRow(r).height = 22;
    r++;
  }
  ws.getRow(r).height = 10;
  r++;

  // ── Stat tiles
  const tileRanges = split(W, Math.max(1, p.tiles.length));
  const edge = { left: { style: "medium" as const, color: { argb: WHITE } }, right: { style: "medium" as const, color: { argb: WHITE } } };
  p.tiles.forEach((t, i) => {
    const [c1, c2] = tileRanges[i];
    band(ws, r, c1, c2, t.label, {
      font: { name: FONT, size: 8, bold: true, color: { argb: MUTED } },
      fill: solid(TONES[t.tone].fill),
      alignment: { vertical: "bottom", horizontal: "center" },
      border: edge,
    });
  });
  ws.getRow(r).height = 20;
  r++;
  p.tiles.forEach((t, i) => {
    const [c1, c2] = tileRanges[i];
    band(ws, r, c1, c2, t.value, {
      font: { name: FONT, size: 16, bold: true, color: { argb: TONES[t.tone].color } },
      fill: solid(TONES[t.tone].fill),
      alignment: { vertical: "middle", horizontal: "center" },
      numFmt: NUM_FORMAT[t.format],
      border: edge,
    });
  });
  ws.getRow(r).height = 34;
  r++;
  ws.getRow(r).height = 12;
  r++;

  // ── Table
  const headerRow = r;
  const isNumeric = (f: ReportColumnFormat) => f !== "text";
  cols.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "center" : isNumeric(c.format) ? "right" : "left", indent: i === 0 ? 0 : 1, wrapText: true };
    cell.border = { top: thin(NAVY), bottom: thin(NAVY), left: thin(NAVY), right: thin(NAVY) };
  });
  ws.getRow(r).height = 26;
  r++;

  const cellBorder = { top: thin(BORDER), bottom: thin(BORDER), left: thin(BORDER), right: thin(BORDER) };
  dataRows.forEach((row, idx) => {
    const fill = solid(idx % 2 === 0 ? WHITE : SAGE_TINT);
    cols.forEach((c, i) => {
      const raw = row[i];
      const cell = ws.getCell(r, i + 1);
      const numeric = isNumeric(c.format) && raw !== null && raw !== "" && raw !== undefined && !Number.isNaN(Number(raw));
      // Strings stay plain text in Excel (never a formula), so user-typed names starting with "=" are harmless.
      cell.value = numeric ? Number(raw) : raw === null || raw === undefined ? "" : String(raw);
      cell.font = { name: FONT, size: 10, color: { argb: i === 0 ? MUTED : INK } };
      cell.fill = fill;
      cell.border = cellBorder;
      if (numeric) cell.numFmt = NUM_FORMAT[c.format] as string;
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "center" : isNumeric(c.format) ? "right" : "left", indent: i === 0 ? 0 : 1, wrapText: !isNumeric(c.format) };
    });
    ws.getRow(r).height = 22;
    r++;
  });

  if (!dataRows.length) {
    band(ws, r, 1, W, "No records for this report.", {
      font: { name: FONT, size: 10, italic: true, color: { argb: MUTED } },
      alignment: { horizontal: "center", vertical: "middle" },
      border: cellBorder,
    });
    ws.getRow(r).height = 24;
    r++;
  } else {
    const totalStyle = {
      font: { name: FONT, size: 11, bold: true, color: { argb: NAVY } },
      fill: solid(GOLD_TINT),
      border: { top: { style: "medium" as const, color: { argb: GOLD_LINE } }, bottom: thin(GOLD_LINE), left: thin(GOLD_LINE), right: thin(GOLD_LINE) },
    };
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      Object.assign(cell, {
        style: {
          ...totalStyle,
          alignment: { vertical: "middle", horizontal: i <= 1 ? "left" : "right", indent: i === 0 ? 0 : 1 },
          ...(NUM_FORMAT[c.format] ? { numFmt: NUM_FORMAT[c.format] } : {}),
        },
      });
      const v = totalsRow[i];
      if (v !== null && v !== undefined && v !== "") cell.value = v;
    });
    ws.getRow(r).height = 24;
    r++;
  }

  // ── Signature lines: Prepared by -> Barangay Secretary, Noted -> Barangay Captain.
  r += 2;
  const sw = Math.max(2, Math.floor(W * 0.4));
  const signLabel = { font: { name: FONT, size: 10.5, bold: true, color: { argb: INK } }, alignment: { horizontal: "left", vertical: "middle", indent: 1 } };
  band(ws, r, 1, sw, "Prepared by:", signLabel);
  band(ws, r, W - sw + 1, W, "Noted:", signLabel);
  r++;
  ws.getRow(r).height = 48;
  const signName = { font: { name: FONT, size: 12, bold: true, color: { argb: "FF000000" } }, alignment: { horizontal: "center", vertical: "bottom" } };
  band(ws, r, 1, sw, p.officials?.secretary?.name ?? "", signName);
  band(ws, r, W - sw + 1, W, p.officials?.captain?.name ?? "", signName);
  r++;
  const signTitle = { border: { top: thin(MUTED) }, font: { name: FONT, size: 10.5, color: { argb: INK } }, alignment: { horizontal: "center", vertical: "top" } };
  band(ws, r, 1, sw, "Barangay Secretary", signTitle);
  band(ws, r, W - sw + 1, W, "Barangay Captain", signTitle);
  r += 2;
  band(ws, r, 1, W, `Generated via Piao Connect — Barangay Information Management System · ${p.generatedAt}`, {
    font: { name: FONT, size: 8, color: { argb: FAINT } },
    alignment: { horizontal: "center" },
  });
  const lastRow = r;

  // ── Print setup: A4, one page wide, header row repeats, page numbers.
  const lastColLetter = ws.getColumn(W).letter;
  ws.pageSetup = {
    paperSize: 9,
    orientation: W > 8 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    printArea: `A1:${lastColLetter}${lastRow}`,
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: "&L&8Piao Connect · Barangay Piao&R&8Page &P of &N" };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
