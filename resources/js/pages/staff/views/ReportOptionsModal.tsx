import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, FileType, Printer, Search, X, Download, ListChecks, Users } from "lucide-react";

export interface SectionDef {
  key: string;
  labelKey: string;
  descKey: string;
}

export interface RecordEventOption {
  id: string;
  name: string;
  date: string;
  status: string;
  eligible: number;
  attended: number;
}

export type AttendeeFilter = "all" | "present" | "absent";

interface Props {
  open: boolean;
  mode: "print" | "download";
  reportLabel: string;
  sections: SectionDef[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  /** Attendance report only: events that can get a full attendee list. */
  recordEvents?: RecordEventOption[];
  recordIds: string[];
  onRecordIdsChange: (next: string[]) => void;
  attendeeFilter: AttendeeFilter;
  onAttendeeFilterChange: (next: AttendeeFilter) => void;
  busy: boolean;
  onClose: () => void;
  onPrint: () => void;
  onDownload: (format: "pdf" | "word") => void;
  t: (key: string) => string;
}

const STATUS_STYLE: Record<string, string> = {
  Upcoming: "bg-sky-500/15 text-sky-300",
  Ongoing: "bg-emerald-500/15 text-emerald-300",
  Past: "bg-white/10 text-white/50",
};

function Box({ checked }: { checked: boolean }) {
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

/**
 * "Print & Export Options" -- lets staff pick exactly which parts of the
 * current report go on the printout / PDF / Word file, and (attendance
 * report) which events get a full attendee list.
 */
export default function ReportOptionsModal({
  open, mode, reportLabel, sections, selected, onSelectedChange,
  recordEvents = [], recordIds, onRecordIdsChange, attendeeFilter, onAttendeeFilterChange,
  busy, onClose, onPrint, onDownload, t,
}: Props) {
  const [search, setSearch] = useState("");

  const hasRecordsSection = sections.some((s) => s.key === "records");
  const recordsOn = hasRecordsSection && selected.includes("records");

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? recordEvents.filter((e) => e.name.toLowerCase().includes(q) || e.date.includes(q)) : recordEvents;
  }, [recordEvents, search]);

  if (!open) return null;

  const toggleSection = (key: string) =>
    onSelectedChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const toggleEvent = (id: string) =>
    onRecordIdsChange(recordIds.includes(id) ? recordIds.filter((x) => x !== id) : [...recordIds, id]);

  const allKeys = sections.map((s) => s.key);
  const summaryKeys = sections.filter((s) => s.key === "summary").map((s) => s.key);

  const noSection = selected.length === 0;
  const noEvent = recordsOn && recordIds.length === 0;
  const blocked = noSection || noEvent || busy;

  const attendeeOptions: { key: AttendeeFilter; label: string }[] = [
    { key: "all", label: t("rptAttAll") },
    { key: "present", label: t("rptAttPresent") },
    { key: "absent", label: t("rptAttAbsent") },
  ];

  const presetBtn = "rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white";

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 px-4 py-6 print:hidden">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#0A0E1A] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-7 py-5">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4FBEB0]/15 text-[#4FBEB0]">
              {mode === "print" ? <Printer className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            </span>
            <div>
              <h3 className="text-xl font-black text-white">{t("rptOptionsTitle")}</h3>
              <p className="mt-0.5 text-sm text-white/50">
                {reportLabel} · {mode === "print" ? t("rptOptionsPrintSub") : t("rptOptionsDownloadSub")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancelLabel")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-7 overflow-y-auto px-7 py-6">
          {/* Sections */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-white/80">{t("rptIncludeHeading")}</p>
                <p className="mt-0.5 text-xs text-white/40">{selected.length} / {sections.length} {t("rptSectionsSelected")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={presetBtn} onClick={() => onSelectedChange(allKeys)}>{t("rptPresetAll")}</button>
                <button type="button" className={presetBtn} onClick={() => onSelectedChange(summaryKeys)}>{t("rptPresetSummary")}</button>
                {hasRecordsSection && (
                  <button type="button" className={presetBtn} onClick={() => onSelectedChange(["records"])}>{t("rptPresetLists")}</button>
                )}
                <button type="button" className={presetBtn} onClick={() => onSelectedChange([])}>{t("rptPresetNone")}</button>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {sections.map((s) => {
                const on = selected.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSection(s.key)}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                      on ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="mt-0.5"><Box checked={on} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{t(s.labelKey)}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-white/45">{t(s.descKey)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Events + attendee lists */}
          {recordsOn && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8B84A]/15 text-[#E8B84A]">
                  <Users className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{t("rptRecordsTitle")}</p>
                  <p className="mt-0.5 text-xs text-white/45">{t("rptRecordsHint")}</p>
                </div>
              </div>

              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">{t("rptAttendeeFilter")}</p>
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                {attendeeOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onAttendeeFilterChange(o.key)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                      attendeeFilter === o.key ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                  {recordIds.length} / {recordEvents.length} {t("rptEventsSelected")}
                </p>
                <div className="flex gap-2">
                  <button type="button" className={presetBtn} onClick={() => onRecordIdsChange(recordEvents.map((e) => e.id))}>{t("rptSelectAllEvents")}</button>
                  <button type="button" className={presetBtn} onClick={() => onRecordIdsChange([])}>{t("rptClearEvents")}</button>
                </div>
              </div>

              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("rptSearchEvents")}
                  className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[#4FBEB0]/60 focus:outline-none"
                />
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredEvents.length === 0 ? (
                  <p className="py-6 text-center text-sm italic text-white/35">{t("noMatchesFoundLabel")}</p>
                ) : (
                  filteredEvents.map((ev) => {
                    const on = recordIds.includes(ev.id);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => toggleEvent(ev.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                          on ? "border-[#4FBEB0]/45 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                        }`}
                      >
                        <Box checked={on} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{ev.name}</span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {ev.date} · {ev.attended} / {ev.eligible} {t("rptRegisteredShort")}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[ev.status] ?? STATUS_STYLE.Past}`}>
                          {t(`rptStatus${ev.status}`)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-white/10 px-7 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-xs ${noSection || noEvent ? "text-amber-300" : "text-white/40"}`}>
            {noSection ? t("rptNeedSection") : noEvent ? t("rptNeedEvent") : busy ? t("rptPreparing") : <span className="inline-flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />{selected.length} {t("rptSectionsSelected")}</span>}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {t("cancelLabel")}
            </button>
            {mode === "print" ? (
              <button
                type="button"
                disabled={blocked}
                onClick={onPrint}
                className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Printer className="h-4 w-4" /> {busy ? t("rptPreparing") : t("rptPrintNow")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onDownload("word")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText className="h-4 w-4 text-[#7DD8CB]" /> {t("downloadAsWordLabel")}
                </button>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onDownload("pdf")}
                  className="inline-flex items-center gap-2 rounded-full bg-sage-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileType className="h-4 w-4" /> {t("downloadAsPdfLabel")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
