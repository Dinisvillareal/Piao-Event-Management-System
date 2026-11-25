import { useEffect, useMemo, useRef, useState } from "react";
import { X, Printer, KeyRound, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import Portal from "../ui/Portal";

// The one-time activation slip. The code is shown here once and printed;
// the server keeps only a hash, so it can never be shown again.
export type ActivationSlip = {
  user_code: string;
  name: string;
  code: string;
  expires_at: string;
  /** Name of the staff member who printed the slip. */
  issued_by?: string;
};

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The slip is a small formal document (letterhead, details table, steps,
// signature lines). The same HTML is shown in the pop-up and sent to the
// printer, so what staff see is exactly what prints.
function buildSlipHtml(
  slip: ActivationSlip,
  t: (k: string) => string,
  expires: string,
  issued: string,
  origin: string,
  forStaff = false
) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t("actDocTitle"))}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#1a1a1a;font-family:"DejaVu Sans",Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:720px;margin:0 auto;padding:28px 32px 32px}
.head{display:flex;align-items:center;gap:16px}
.head img{width:70px;height:70px;object-fit:contain;flex:none}
.head .mid{flex:1;min-width:0}.head .right{text-align:right;flex:none}
.tiny{font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#222;margin:0}
.ln{font-size:10px;color:#222;margin:2px 0 0}
.brgy{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#000;margin:6px 0 4px}
.sys{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#4FBEB0;margin:0}
.gen{font-size:9px;color:#667777;margin:8px 0 0}.gen b{display:block;color:#005F63;margin-top:1px}
.rule{border-top:3px solid #005F63;margin-top:8px}
h1{font-size:16px;text-align:center;letter-spacing:.14em;text-transform:uppercase;margin:22px 0 18px;color:#005F63}
table.d{width:100%;border-collapse:collapse;font-size:13px}
table.d th,table.d td{border:1px solid #777;padding:9px 12px;text-align:left;vertical-align:middle}
table.d th{width:34%;background:#eef6f5;font-weight:700}
td.code{font-family:"Courier New",monospace;font-size:22px;font-weight:700;letter-spacing:.12em;color:#005F63;background:#f8fbfb}
td.uc{font-family:"Courier New",monospace;font-size:16px;font-weight:700;letter-spacing:.08em}
.dash{display:inline-block;margin:0 .35em;font-weight:900;color:#005F63}
h2{font-size:12px;margin:22px 0 6px;color:#005F63;text-transform:uppercase;letter-spacing:.06em}
ol{margin:0;padding-left:22px;font-size:12.5px;line-height:1.65}
.note{margin-top:18px;border:1px solid #9a7b1c;background:#fff8e1;padding:10px 14px;font-size:11.5px;line-height:1.5}
.sig{display:flex;gap:40px;margin-top:40px}
.sig>div{flex:1;text-align:center;font-size:11px}
.sig .nm{font-weight:700;font-size:12px;min-height:16px;padding-bottom:3px}
.sig .line{border-top:1px solid #667777;margin-bottom:4px}
@media screen and (max-width:520px){
 .page{padding:18px 14px 22px}
 .head{flex-wrap:wrap;gap:10px}.head img{width:54px;height:54px}
 .head .right{flex-basis:100%;text-align:left}
 h1{font-size:14px;letter-spacing:.08em;margin:16px 0 12px}
 table.d{font-size:12px}table.d th,table.d td{padding:7px 8px}
 td.code{font-size:17px;letter-spacing:.06em}td.uc{font-size:14px}
 ol{font-size:12px}.sig{gap:18px;margin-top:30px}
}
@media print{.page{max-width:none;padding:18mm 20mm}}
</style></head><body><div class="page">
<div class="head">
 <img src="${origin}/logo-removebg-preview.jpg" alt="">
 <div class="mid">
  <p class="tiny">Republic of the Philippines</p>
  <p class="ln">Province of Zamboanga del Norte, Region IX</p>
  <p class="ln">Municipality of President Manuel A. Roxas</p>
  <p class="brgy">Barangay Piao</p>
  <p class="ln">Purok Uno — Barangay Hall, Piao, Roxas, Zamboanga del Norte, 7102</p>
 </div>
 <div class="right"><p class="sys">Piao Connect</p><p class="gen">${esc(t("actDocGenerated"))}<b>${esc(issued)}</b></p></div>
</div>
<div class="rule"></div>
<h1>${esc(t("actDocTitle"))}</h1>
<table class="d">
<tr><th>${esc(t(forStaff ? "actDocStaffMember" : "actDocResident"))}</th><td>${esc(slip.name)}</td></tr>
<tr><th>${esc(t("actSlipUserCode"))}</th><td class="uc">${esc(slip.user_code)}</td></tr>
<tr><th>${esc(t("actSlipCode"))}</th><td class="code">${slip.code.split("-").map(esc).join('<span class="dash">&ndash;</span>')}</td></tr>
<tr><th>${esc(t("actSlipValid"))}</th><td>${esc(expires)}</td></tr>
</table>
<h2>${esc(t("actDocHowTitle"))}</h2>
<ol><li>${esc(t("actDocStep1"))}</li><li>${esc(t("actDocStep2"))}</li><li>${esc(t("actDocStep3"))}</li><li>${esc(t("actDocStep4"))}</li></ol>
<div class="note">${esc(t("actDocNotice"))}</div>
<div class="sig"><div><div class="nm">${esc(slip.issued_by || "")}</div><div class="line"></div>${esc(t("actDocStaffSig"))}</div><div><div class="nm">${esc(slip.name)}</div><div class="line"></div>${esc(t(forStaff ? "actDocStaffRecvSig" : "actDocResSig"))}</div></div>
</div></body></html>`;
}

export default function ActivationSlipModal({ slip, onClose, forStaff = false }: { slip: ActivationSlip; onClose: () => void; forStaff?: boolean }) {
  const { t, locale } = useLanguage();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(520);

  const fmt = (d: Date, withTime: boolean) => {
    try {
      return d.toLocaleString(locale, withTime ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" });
    } catch {
      return d.toISOString();
    }
  };
  const html = useMemo(
    () => buildSlipHtml(slip, t, fmt(new Date(slip.expires_at), true), fmt(new Date(), false), window.location.origin, forStaff),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slip, locale, forStaff]
  );

  const fit = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) setHeight(doc.documentElement.scrollHeight + 4);
  };
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const print = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-3 backdrop-blur-sm sm:px-4">
        <div className="flex max-h-[94vh] w-full max-w-3xl flex-col rounded-[24px] border border-white/10 bg-[#0A0E1A] p-4 shadow-2xl sm:rounded-[30px] sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4FBEB0]/15 text-[#7DD8CB]">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-extrabold tracking-tight text-white sm:text-2xl">{t("actSlipTitle")}</h2>
                <p className="text-xs text-white/60 sm:text-sm">{t(forStaff ? "actSlipSubStaff" : "actSlipSub")}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label={t("closeLabel")} className="shrink-0 text-white/50 hover:text-white">
              <X size={24} />
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl bg-white shadow-inner">
            <iframe
              ref={frameRef}
              title={t("actDocTitle")}
              srcDoc={html}
              onLoad={fit}
              style={{ height }}
              className="block w-full border-0 bg-white"
            />
          </div>

          <div className="mt-3 flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p className="text-xs text-amber-200 sm:text-sm">{t("actSlipOnce")}</p>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={print}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/15"
            >
              <Printer className="h-5 w-5" /> {t("actSlipPrint")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full bg-[#4FBEB0] px-6 py-3 text-base font-bold text-[#0A0E1A] transition hover:bg-[#6ACBBE]"
            >
              {t("actSlipDone")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
