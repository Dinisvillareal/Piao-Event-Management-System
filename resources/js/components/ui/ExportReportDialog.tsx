import React, { useEffect } from "react";
import { Check, Download, FileSpreadsheet, FileText, ListChecks, X as XIcon } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import Portal from "./Portal";

/**
 * The "Export to Excel / PDF" options window shared by the list reports (same look as the Residents
 * export): what to include (passed in as children), which columns to print, and the optional
 * opening message. It only collects choices -- the screen that opens it asks for confirmation and
 * does the download, so each report keeps its own rules.
 */

export interface ExportColumnOption {
  key: string;
  label: string;
  description: string;
}

interface ExportReportDialogProps {
  open: boolean;
  format: "excel" | "pdf";
  /** Name of the report shown under the title, e.g. "Activity Log". */
  reportName: string;
  subtitle: string;
  /** Heading + hint of the first section (children are rendered inside it). */
  sectionTitle: string;
  sectionHint?: React.ReactNode;
  children?: React.ReactNode;
  columns: ExportColumnOption[];
  selected: string[];
  onSelectedChange: (keys: string[]) => void;
  minColumns: number;
  includeMessage: boolean;
  onIncludeMessageChange: (value: boolean) => void;
  busy: boolean;
  /** Turns the Download button off (e.g. nothing to export). */
  downloadDisabled?: boolean;
  onClose: () => void;
  onDownload: () => void;
}

/** Checkbox look shared by every option in the window (same as the Reports "Print & Export Options"). */
export function ExportBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
        checked ? "border-[#4FBEB0] bg-[#4FBEB0] text-[#0A0E1A]" : "border-white/25 bg-transparent"
      }`}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
    </span>
  );
}

const presetBtn = "rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-white/70 sm:px-3.5 sm:text-[13px] transition hover:border-white/30 hover:bg-white/10 hover:text-white";
const optionBase = "flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors sm:px-4 sm:py-3.5";
const optionOn = "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]";
const optionOff = "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]";

export default function ExportReportDialog({
  open,
  format,
  reportName,
  subtitle,
  sectionTitle,
  sectionHint,
  children,
  columns,
  selected,
  onSelectedChange,
  minColumns,
  includeMessage,
  onIncludeMessageChange,
  busy,
  downloadDisabled,
  onClose,
  onDownload,
}: ExportReportDialogProps) {
  const { t } = useLanguage();

  // Escape closes the window (unless a download is running).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const toggle = (key: string) => onSelectedChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const colsLabel = t("resExportColsSelected").replace("{n}", String(selected.length)).replace("{total}", String(columns.length));
  const tooFew = selected.length < minColumns;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
        onClick={() => !busy && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("resExportDialogTitle").replace("{format}", format === "excel" ? "Excel" : "PDF")}
          className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[24px] border border-white/10 bg-[#0A0E1A] shadow-2xl sm:max-h-[92dvh] sm:rounded-[30px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:gap-4 sm:px-7 sm:py-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4FBEB0]/15 text-[#4FBEB0] sm:h-11 sm:w-11 sm:rounded-2xl">
                {format === "excel" ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-black leading-tight text-white sm:text-2xl">{t("resExportDialogTitle").replace("{format}", format === "excel" ? "Excel" : "PDF")}</h3>
                <p className="mt-0.5 text-[13px] leading-snug text-white/50 sm:text-[15px]">{reportName} · {subtitle}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label={t("closeLabel")} className="shrink-0 rounded-full p-1 text-white/50 hover:text-white">
              <XIcon size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-7 sm:px-7 sm:py-6">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-white/80 sm:text-[15px]">{sectionTitle}</p>
              {sectionHint && <p className="mt-0.5 mb-3 text-[13px] text-white/40">{sectionHint}</p>}
              {children}
            </div>

            {/* Columns */}
            <div className="border-t border-white/10 pt-5 sm:pt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <div>
                  <p className="text-[13px] font-bold uppercase tracking-wide text-white/80 sm:text-[15px]">{t("resExportColumns")}</p>
                  <p className="mt-0.5 text-[13px] text-white/40">{colsLabel}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={presetBtn} onClick={() => onSelectedChange(columns.map((c) => c.key))}>{t("resExportSelectAll")}</button>
                  <button type="button" className={presetBtn} onClick={() => onSelectedChange([])}>{t("resExportClearAll")}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {columns.map((c) => {
                  const on = selected.includes(c.key);
                  return (
                    <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={on} className={`${optionBase} ${on ? optionOn : optionOff}`}>
                      <span className="mt-0.5"><ExportBox checked={on} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white sm:text-[15px]">{c.label}</span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-white/45 sm:text-[13px]">{c.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Other options */}
            <div className="border-t border-white/10 pt-5 sm:pt-6">
              <p className="mb-3 text-[13px] font-bold uppercase tracking-wide text-white/80 sm:text-[15px]">{t("resExportOther")}</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button type="button" onClick={() => onIncludeMessageChange(!includeMessage)} aria-pressed={includeMessage} className={`${optionBase} ${includeMessage ? optionOn : optionOff}`}>
                  <span className="mt-0.5"><ExportBox checked={includeMessage} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white sm:text-[15px]">{t("resExportIncludeMessage")}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-white/45 sm:text-[13px]">{t("resExportIncludeMessageHint")}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4">
            <p className="inline-flex items-center gap-1.5 text-[13px] text-white/45 sm:text-[14px]">
              {tooFew ? (
                <span className="text-amber-300">{t("resExportMinColumns").replace("{n}", String(minColumns))}</span>
              ) : (
                <>
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  {colsLabel}
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:gap-3">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-white/15 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/10 sm:px-6 sm:text-[15px]">
                {t("cancelLabel")}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={busy || tooFew || !!downloadDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-sage-700 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-6 sm:text-[15px]"
              >
                <Download className="h-4 w-4" />
                {busy ? t("resExporting") : t("resExportDownload")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
