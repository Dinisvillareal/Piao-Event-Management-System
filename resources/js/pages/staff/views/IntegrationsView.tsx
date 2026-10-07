// import React, { useEffect, useState } from "react";
// import { MessageCircle, QrCode, CheckCircle2, Link2, Unlink, XCircle, CheckCircle } from "lucide-react";
// import api, { apiErrorMessage } from "../../../lib/api";
// import ConfirmDialog from "../../../components/ui/ConfirmDialog";
// import Skeleton from "../../../components/ui/Skeleton";
// import { useLanguage } from "../../../i18n/LanguageContext";

// /**
//  * Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)
//  * + Text/physical QR ID". This screen owns the Facebook Page connection;
//  * the physical/manual ID check-in half of "2 in 1" lives in the QR
//  * Scanner's "Manual / Physical ID" tab (ScanView) since that's where staff
//  * actually use it during an event.
//  */
// export default function IntegrationsView() {
//   const { t } = useLanguage();
//   const [status, setStatus] = useState<{ connected: boolean; page_id: string | null; connected_at: string | null } | null>(null);
//   const [pageId, setPageId] = useState("");
//   const [accessToken, setAccessToken] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [success, setSuccess] = useState<string | null>(null);
//   const [confirmConnect, setConfirmConnect] = useState(false);

//   const load = async () => {
//     setLoading(true);
//     try {
//       const res = await api.get("/integrations/facebook");
//       setStatus(res.data);
//     } catch (e) {
//       setError(apiErrorMessage(e, t("loadIntegrationFailed")));
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     load();
//   }, []);

//   const handleConnect = (e: React.FormEvent) => {
//     e.preventDefault();
//     setError(null);

//     if (!pageId.trim()) {
//       setError(t("pageIdRequiredError"));
//       return;
//     }
//     if (!accessToken.trim()) {
//       setError(t("accessTokenRequiredError"));
//       return;
//     }

//     setConfirmConnect(true);
//   };

//   const performConnect = async () => {
//     setConfirmConnect(false);
//     setSaving(true);
//     setError(null);
//     setSuccess(null);
//     try {
//       await api.post("/integrations/facebook", { page_id: pageId, access_token: accessToken });
//       setSuccess(t("fbConnectedSuccess"));
//       setPageId("");
//       setAccessToken("");
//       load();
//     } catch (e) {
//       setError(apiErrorMessage(e, t("connectFbFailed")));
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleDisconnect = async () => {
//     setSaving(true);
//     try {
//       await api.delete("/integrations/facebook");
//       load();
//     } catch (e) {
//       setError(apiErrorMessage(e, t("disconnectFailed")));
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="space-y-6 max-w-3xl">
//       <div>
//         <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("integrations")}</h1>
//         <p className="mt-1 text-sm text-[#667777]">{t("integrationsSubtitle")}</p>
//       </div>

//       <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
//         <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
//         <div className="p-6">
//           <div className="flex items-center gap-3">
//             <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]/10">
//               <MessageCircle className="h-5 w-5 text-[#1877F2]" />
//             </div>
//             <div>
//               <h2 className="text-xl font-black text-[#005f63]">{t("facebookPageTitle")}</h2>
//               <p className="text-xs text-gray-500">{t("facebookPageDesc")}</p>
//             </div>
//           </div>

//           {loading ? (
//             <div className="mt-5 space-y-3">
//               <Skeleton dark={false} className="h-11 w-full rounded-full" />
//               <Skeleton dark={false} className="h-11 w-full rounded-full" />
//               <Skeleton dark={false} className="h-10 w-36 rounded-full" />
//             </div>
//           ) : (
//             <div className="mt-5">
//               {status?.connected ? (
//                 <div className="rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3 flex items-center justify-between gap-3">
//                   <div className="flex items-center gap-2 text-teal-800 text-sm font-medium">
//                     <CheckCircle2 className="h-4 w-4 shrink-0" />
//                     {t("connectedToPageId")} {status.page_id}
//                   </div>
//                   <button onClick={handleDisconnect} disabled={saving} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700">
//                     <Unlink className="h-3.5 w-3.5" /> {t("disconnect")}
//                   </button>
//                 </div>
//               ) : (
//                 <form onSubmit={handleConnect} noValidate className="space-y-3">
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">{t("facebookPageIdLabel")}</label>
//                     <input required value={pageId} onChange={(e) => setPageId(e.target.value)} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder="e.g. 123456789012345" />
//                   </div>
//                   <div>
//                     <label className="block text-sm font-medium text-gray-700 mb-1">{t("pageAccessTokenLabel")}</label>
//                     <input required type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder="From the Meta Developer Portal" />
//                     <p className="mt-1 text-xs text-gray-400">{t("pageAccessTokenHint")}</p>
//                   </div>
//                   <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm disabled:opacity-60">
//                     <Link2 className="h-4 w-4" /> {saving ? t("connecting") : t("connectPage")}
//                   </button>
//                 </form>
//               )}
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
//         <div className="h-1.5 bg-gradient-to-r from-orange-400 to-yellow-300" />
//         <div className="p-6">
//           <div className="flex items-center gap-3">
//             <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100">
//               <QrCode className="h-5 w-5 text-orange-600" />
//             </div>
//             <div>
//               <h2 className="text-xl font-black text-[#005f63]">{t("physicalQrIdTitle")}</h2>
//               <p className="text-xs text-gray-500">{t("physicalQrIdDesc")}</p>
//             </div>
//           </div>
//           <p className="mt-4 text-sm text-gray-600">
//             {t("physicalQrIdBody1")} <strong>{t("physicalQrIdToggleLabel")}</strong> {t("physicalQrIdBody2")}
//             <strong> {t("scan")}</strong> {t("physicalQrIdBody3")}
//           </p>
//         </div>
//       </div>
//       <ConfirmDialog
//         open={confirmConnect}
//         icon={<Link2 size={32} />}
//         title={t("confirmConnectFbTitle")}
//         body={t("confirmConnectFbBody")}
//         cancelLabel={t("cancelLabel")}
//         confirmLabel={t("yesConnect")}
//         onCancel={() => setConfirmConnect(false)}
//         onConfirm={performConnect}
//       />

//       {error && (
//         <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setError(null)}>
//           <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
//             <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
//             <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
//             <p className="text-[15px] text-gray-600 mb-6">{error}</p>
//             <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white transition">
//               {t("okLabel")}
//             </button>
//           </div>
//         </div>
//       )}

//       {success && (
//         <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setSuccess(null)}>
//           <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
//             <div className="mb-3 text-[#005f63] flex justify-center"><CheckCircle size={40} /></div>
//             <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
//             <p className="text-[15px] text-gray-600 mb-6">{success}</p>
//             <button onClick={() => setSuccess(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
//               {t("okLabel")}
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

import React, { useEffect, useState } from "react";
import { MessageCircle, QrCode, CheckCircle2, Link2, Unlink, XCircle, CheckCircle } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Skeleton from "../../../components/ui/Skeleton";
import { useLanguage } from "../../../i18n/LanguageContext";

/**
 * Adviser recommendation: "2 in 1 — Facebook Page (Developer Portal / API)
 * + Text/physical QR ID". This screen owns the Facebook Page connection;
 * the physical/manual ID check-in half of "2 in 1" lives in the QR
 * Scanner's "Manual / Physical ID" tab (ScanView) since that's where staff
 * actually use it during an event.
 */
export default function IntegrationsView() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<{ connected: boolean; page_id: string | null; connected_at: string | null } | null>(null);
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmConnect, setConfirmConnect] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/integrations/facebook");
      setStatus(res.data);
    } catch (e) {
      setError(apiErrorMessage(e, t("loadIntegrationFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pageId.trim()) {
      setError(t("pageIdRequiredError"));
      return;
    }
    if (!accessToken.trim()) {
      setError(t("accessTokenRequiredError"));
      return;
    }

    setConfirmConnect(true);
  };

  const performConnect = async () => {
    setConfirmConnect(false);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/integrations/facebook", { page_id: pageId, access_token: accessToken });
      setSuccess(t("fbConnectedSuccess"));
      setPageId("");
      setAccessToken("");
      load();
    } catch (e) {
      setError(apiErrorMessage(e, t("connectFbFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await api.delete("/integrations/facebook");
      load();
    } catch (e) {
      setError(apiErrorMessage(e, t("disconnectFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    // Full-bleed dark navy page -- same technique and palette as the
    // Dashboard / Residents / Households / Events / Inventory / Budget /
    // Activity Logs / Archive / Reports / Returns pages, so Integrations
    // reads as part of the same system instead of the old light page.
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("integrations")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("integrationsSubtitle")}</p>
        </div>

        {/* Facebook Page card -- dark navy card with the same border /
            background / rounded-[24px] treatment as every other card in
            the redesigned pages. The top gradient strip is kept as the
            card's own accent (Facebook blue -> light blue) since that's
            this card's own brand cue, just recolored to sit on dark. */}
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#1877F2] via-[#4A9BFF] to-[#7DD8CB]" />
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]/15">
                <MessageCircle className="h-5 w-5 text-[#4A9BFF]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-white">{t("facebookPageTitle")}</h2>
                <p className="text-xs text-white/50">{t("facebookPageDesc")}</p>
              </div>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                <Skeleton className="h-11 w-full rounded-full" />
                <Skeleton className="h-11 w-full rounded-full" />
                <Skeleton className="h-10 w-36 rounded-full" />
              </div>
            ) : (
              <div className="mt-5">
                {status?.connected ? (
                  <div className="rounded-2xl bg-[#4FBEB0]/10 border border-[#4FBEB0]/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-[#7DD8CB] text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {t("connectedToPageId")} {status.page_id}
                    </div>
                    <button
                      onClick={handleDisconnect}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition"
                    >
                      <Unlink className="h-3.5 w-3.5" /> {t("disconnect")}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleConnect} noValidate className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-white mb-1.5">{t("facebookPageIdLabel")}</label>
                      <input
                        required
                        value={pageId}
                        onChange={(e) => setPageId(e.target.value)}
                        className="w-full rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        placeholder="e.g. 123456789012345"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-1.5">{t("pageAccessTokenLabel")}</label>
                      <input
                        required
                        type="password"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70"
                        placeholder="From the Meta Developer Portal"
                      />
                      <p className="mt-1 text-xs text-white/40">{t("pageAccessTokenHint")}</p>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="group inline-flex items-center gap-3 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] pl-5 pr-1.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 ease-out hover:border-[#122436] hover:bg-[#122436] hover:shadow-md disabled:opacity-60"
                    >
                      {saving ? t("connecting") : t("connectPage")}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A0E1A] transition-colors duration-300 ease-out group-hover:bg-white/15">
                        <Link2 className="h-3.5 w-3.5 text-white" />
                      </span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Physical / Manual QR ID card -- gold accent (the "second half"
            of the 2-in-1 story), matching the gold strip treatment used
            for other secondary/paired cards on the dark pages. */}
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-gold-400 via-gold-300 to-[#4FBEB0]" />
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-400/15">
                <QrCode className="h-5 w-5 text-gold-300" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-white">{t("physicalQrIdTitle")}</h2>
                <p className="text-xs text-white/50">{t("physicalQrIdDesc")}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/70 leading-relaxed">
              {t("physicalQrIdBody1")} <strong className="text-white font-semibold">{t("physicalQrIdToggleLabel")}</strong> {t("physicalQrIdBody2")}
              <strong className="text-[#7DD8CB] font-semibold"> {t("scan")}</strong> {t("physicalQrIdBody3")}
            </p>
          </div>
        </div>

        <ConfirmDialog
          open={confirmConnect}
          icon={<Link2 size={32} />}
          title={t("confirmConnectFbTitle")}
          body={t("confirmConnectFbBody")}
          cancelLabel={t("cancelLabel")}
          confirmLabel={t("yesConnect")}
          onCancel={() => setConfirmConnect(false)}
          onConfirm={performConnect}
        />

        {/* Error popup -- dark navy card, matching the app's other error
            popups (StatusModal / ConfirmDialog): red icon + red title +
            red button. */}
        {error && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setError(null)}>
            <div
              className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 text-red-400 flex justify-center"><XCircle size={40} /></div>
              <h3 className="text-xl font-bold text-red-400 mb-2">{t("errorTitle")}</h3>
              <p className="text-[15px] text-white/50 mb-6">{error}</p>
              <button
                onClick={() => setError(null)}
                className="px-6 py-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition"
              >
                {t("okLabel")}
              </button>
            </div>
          </div>
        )}

        {/* Success popup -- same dark card, sage/teal success palette. */}
        {success && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setSuccess(null)}>
            <div
              className="bg-[#0A0E1A] border border-white/10 rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 text-[#4FBEB0] flex justify-center"><CheckCircle size={40} /></div>
              <h3 className="text-xl font-bold text-white mb-2">{t("successTitle")}</h3>
              <p className="text-[15px] text-white/50 mb-6">{success}</p>
              <button
                onClick={() => setSuccess(null)}
                className="px-6 py-2.5 rounded-full bg-gold-400 hover:bg-gold-500 text-[#08130F] font-bold transition"
              >
                {t("okLabel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}