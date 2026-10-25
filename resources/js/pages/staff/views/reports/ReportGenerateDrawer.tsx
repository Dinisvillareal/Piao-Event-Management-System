import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eye, EyeOff, FileSpreadsheet, FileText, FileType, ListChecks, Printer, Search, Users } from "lucide-react";
import api from "../../../../lib/api";
import { matchesSearch } from "../../../../lib/search";
import FormDrawer, { FormSection } from "../../../../components/ui/FormDrawer";
import Skeleton from "../../../../components/ui/Skeleton";
import type { AttendeeFilter, RecordEventOption, SectionDef } from "../ReportOptionsModal";

export type ReportFormat = "print" | "pdf" | "word" | "csv";

interface Props {
  initialFormat?: ReportFormat;
  reportLabel: string;
  /** "Period: Oct 1 – Oct 31" etc. -- exactly what the letterhead will say. */
  scopeText: string;
  sections: SectionDef[];
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  recordEvents?: RecordEventOption[];
  recordIds: string[];
  onRecordIdsChange: (next: string[]) => void;
  attendeeFilter: AttendeeFilter;
  onAttendeeFilterChange: (next: AttendeeFilter) => void;
  /** Query for GET /reports/export/html (type, filters, sections) -- drives the live preview. */
  previewParams: Record<string, string>;
  busy: boolean;
  onClose: () => void;
  onGenerate: (format: ReportFormat) => void;
  t: (key: string) => string;
}

const STATUS_STYLE: Record<string, string> = {
  Upcoming: "bg-sky-500/15 text-sky-300",
  Ongoing: "bg-emerald-500/15 text-emerald-300",
  Past: "bg-white/10 text-white/50",
};

const PAGE_W = 794;
const PAGE_H = 1123;

function Box({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${checked ? "border-[#4FBEB0] bg-[#4FBEB0] text-[#0A0E1A]" : "border-white/25 bg-transparent"}`}>
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
    </span>
  );
}

/** The first page of the real report, as it will print, scaled to fit the drawer. */
function LivePreview({ params, t }: { params: Record<string, string>; t: (k: string) => string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(0.7);
  const wrap = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const key = JSON.stringify(params);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / PAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Debounced, so ticking several sections in a row makes one request.
  useEffect(() => {
    const id = ++reqId.current;
    setFailed(false);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get("/reports/export/html", {
          params: { ...params, preview: 1 },
          responseType: "text",
          transformResponse: (d: any) => d,
        });
        if (id === reqId.current) setHtml(String(res.data));
      } catch {
        if (id === reqId.current) setFailed(true);
      }
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div ref={wrap} className="w-full">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white shadow-lg" style={{ height: PAGE_H * scale }}>
        {html && !failed ? (
          <iframe
            title="Report preview"
            srcDoc={html}
            sandbox="allow-same-origin"
            tabIndex={-1}
            style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, pointerEvents: "none", background: "#fff" }}
          />
        ) : failed ? (
          <div className="flex h-full items-center justify-center bg-[#10162a] px-6 text-center text-sm italic text-white/45">{t("rpPreviewFailed")}</div>
        ) : (
          <div className="h-full bg-[#10162a] p-6">
            <Skeleton className="h-full rounded-lg" />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-white/40">{html || failed ? t("rpPreviewHint") : t("rpPreviewLoading")}</p>
    </div>
  );
}

/**
 * "Generate Report" -- the slide-in panel that replaces the old options
 * dialog. One place to pick the format (Print, PDF, Word, CSV), choose which
 * sections go in, see the real first page, and generate.
 */
export default function ReportGenerateDrawer({
  initialFormat = "pdf", reportLabel, scopeText, sections, selected, onSelectedChange,
  recordEvents = [], recordIds, onRecordIdsChange, attendeeFilter, onAttendeeFilterChange,
  previewParams, busy, onClose, onGenerate, t,
}: Props) {
  const [format, setFormat] = useState<ReportFormat>(initialFormat);
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(true);

  const isCsv = format === "csv";
  const mainSections = sections.filter((s) => s.group !== "other");
  const otherSections = sections.filter((s) => s.group === "other");
  const otherKeys = otherSections.map((s) => s.key);
  const hasRecordsSection = sections.some((s) => s.key === "records");
  const recordsOn = !isCsv && hasRecordsSection && selected.includes("records");
  const mainSelectedCount = selected.filter((k) => !otherKeys.includes(k)).length;
  const keptOther = selected.filter((k) => otherKeys.includes(k));

  const filteredEvents = useMemo(
    () => (search.trim() ? recordEvents.filter((e) => matchesSearch(search, e.name, e.date)) : recordEvents),
    [recordEvents, search]
  );

  const toggleSection = (key: string) => onSelectedChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const toggleEvent = (id: string) => onRecordIdsChange(recordIds.includes(id) ? recordIds.filter((x) => x !== id) : [...recordIds, id]);

  const noSection = !isCsv && mainSelectedCount === 0;
  const noEvent = recordsOn && recordIds.length === 0;
  const blocked = noSection || noEvent || busy;

  const formats: { key: ReportFormat; label: string; desc: string; icon: typeof Printer }[] = [
    { key: "print", label: t("rpFmtPrint"), desc: t("rpFmtPrintDesc"), icon: Printer },
    { key: "pdf", label: t("rpFmtPdf"), desc: t("rpFmtPdfDesc"), icon: FileType },
    { key: "word", label: t("rpFmtWord"), desc: t("rpFmtWordDesc"), icon: FileText },
    { key: "csv", label: t("rpFmtCsv"), desc: t("rpFmtCsvDesc"), icon: FileSpreadsheet },
  ];
  const actionLabel = { print: t("rpActPrint"), pdf: t("rpActPdf"), word: t("rpActWord"), csv: t("rpActCsv") }[format];
  const ActionIcon = format === "print" ? Printer : format === "csv" ? FileSpreadsheet : format === "word" ? FileText : Download;

  const attendeeOptions: { key: AttendeeFilter; label: string }[] = [
    { key: "all", label: t("rptAttAll") },
    { key: "present", label: t("rptAttPresent") },
    { key: "absent", label: t("rptAttAbsent") },
  ];
  const presetBtn = "rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white";

  const sectionButton = (s: SectionDef) => {
    const on = selected.includes(s.key);
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => toggleSection(s.key)}
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${on ? "border-[#4FBEB0]/50 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}
      >
        <span className="mt-0.5"><Box checked={on} /></span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-white">{t(s.labelKey)}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-white/45">{t(s.descKey)}</span>
        </span>
      </button>
    );
  };

  return (
    <FormDrawer
      z="z-[9990]"
      title={t("rpDrawerTitle")}
      subtitle={`${reportLabel} · ${t("rpDrawerSub")}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-[13px] ${noSection || noEvent ? "text-amber-300" : "text-white/45"}`}>
            {noSection ? t("rptNeedSection") : noEvent ? t("rptNeedEvent") : busy ? t("rptPreparing") : isCsv ? t("rpFmtCsvDesc") : (
              <span className="inline-flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" />{mainSelectedCount} {t("rptSectionsSelected")}</span>
            )}
          </p>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onGenerate(format)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-sage-700 px-7 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ActionIcon className="h-4 w-4" /> {busy ? t("rptPreparing") : actionLabel}
          </button>
        </div>
      }
    >
      <FormSection title={t("rpCoversHeading")} className="space-y-0">
        <p className="rounded-2xl border border-[#4FBEB0]/25 bg-[#4FBEB0]/[0.07] px-4 py-3 text-[15px] font-semibold text-[#7DD8CB]">
          {reportLabel} · {scopeText}
        </p>
      </FormSection>

      <FormSection title={t("rpFormatHeading")} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {formats.map((f) => {
            const on = format === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFormat(f.key)}
                aria-pressed={on}
                className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors ${on ? "border-[#4FBEB0]/60 bg-[#4FBEB0]/[0.09]" : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-[#4FBEB0]/20 text-[#4FBEB0]" : "bg-white/[0.06] text-white/60"}`}>
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-white">{f.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-white/45">{f.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        {isCsv && <p className="text-[13px] leading-snug text-white/45">{t("rpCsvNote")}</p>}
      </FormSection>

      {!isCsv && (
        <>
          <FormSection title={t("rptIncludeHeading")} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-white/45">{mainSelectedCount} / {mainSections.length} {t("rptSectionsSelected")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={presetBtn} onClick={() => onSelectedChange([...mainSections.map((s) => s.key), ...keptOther])}>{t("rptPresetAll")}</button>
                <button type="button" className={presetBtn} onClick={() => onSelectedChange([...mainSections.filter((s) => s.key === "summary").map((s) => s.key), ...keptOther])}>{t("rptPresetSummary")}</button>
                {hasRecordsSection && <button type="button" className={presetBtn} onClick={() => onSelectedChange(["records", ...keptOther])}>{t("rptPresetLists")}</button>}
                <button type="button" className={presetBtn} onClick={() => onSelectedChange([...keptOther])}>{t("rptPresetNone")}</button>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">{mainSections.map(sectionButton)}</div>
            {otherSections.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <p className="mb-3 text-sm font-bold uppercase tracking-wide text-white/60">{t("rptOtherHeading")}</p>
                <div className="grid gap-2.5 sm:grid-cols-2">{otherSections.map(sectionButton)}</div>
              </div>
            )}
          </FormSection>

          {recordsOn && (
            <FormSection title={t("rptRecordsTitle")} className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8B84A]/15 text-[#E8B84A]"><Users className="h-[18px] w-[18px]" /></span>
                <p className="text-[13px] leading-snug text-white/50">{t("rptRecordsHint")}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">{t("rptAttendeeFilter")}</p>
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {attendeeOptions.map((o) => (
                    <button key={o.key} type="button" onClick={() => onAttendeeFilterChange(o.key)} className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${attendeeFilter === o.key ? "bg-sage-700 text-white shadow-sm" : "text-white/55 hover:text-white"}`}>{o.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40">{recordIds.length} / {recordEvents.length} {t("rptEventsSelected")}</p>
                <div className="flex gap-2">
                  <button type="button" className={presetBtn} onClick={() => onRecordIdsChange(recordEvents.map((e) => e.id))}>{t("rptSelectAllEvents")}</button>
                  <button type="button" className={presetBtn} onClick={() => onRecordIdsChange([])}>{t("rptClearEvents")}</button>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("rptSearchEvents")} className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-4 text-[15px] text-white placeholder:text-white/30 focus:border-[#4FBEB0]/60 focus:outline-none" />
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredEvents.length === 0 ? (
                  <p className="py-6 text-center text-[15px] italic text-white/35">{t("noMatchesFoundLabel")}</p>
                ) : (
                  filteredEvents.map((ev) => {
                    const on = recordIds.includes(ev.id);
                    return (
                      <button key={ev.id} type="button" onClick={() => toggleEvent(ev.id)} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-[#4FBEB0]/45 bg-[#4FBEB0]/[0.07]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"}`}>
                        <Box checked={on} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-white">{ev.name}</span>
                          <span className="mt-0.5 block text-[13px] text-white/45">{ev.date} · {ev.attended} / {ev.eligible} {t("rptRegisteredShort")}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_STYLE[ev.status] ?? STATUS_STYLE.Past}`}>{t(`rptStatus${ev.status}`)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </FormSection>
          )}

          <FormSection title={t("rpPreview")} className="space-y-3">
            <button type="button" onClick={() => setShowPreview((v) => !v)} className={`${presetBtn} inline-flex items-center gap-2`}>
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {t("rpPreview")}
            </button>
            {showPreview && <LivePreview params={previewParams} t={t} />}
          </FormSection>
        </>
      )}
    </FormDrawer>
  );
}
