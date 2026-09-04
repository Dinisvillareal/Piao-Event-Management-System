import React, { useEffect, useState } from "react";
import { MessageCircle, QrCode, CheckCircle2, Link2, Unlink, XCircle, CheckCircle } from "lucide-react";
import api, { apiErrorMessage } from "../../../lib/api";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-4xl font-black text-[#005f63]">{t("integrations")}</h1>
        <p className="mt-1 text-sm text-[#667777]">{t("integrationsSubtitle")}</p>
      </div>

      <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]/10">
              <MessageCircle className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#005f63]">{t("facebookPageTitle")}</h2>
              <p className="text-xs text-gray-500">{t("facebookPageDesc")}</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>
          ) : (
            <div className="mt-5">
              {status?.connected ? (
                <div className="rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-teal-800 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t("connectedToPageId")} {status.page_id}
                  </div>
                  <button onClick={handleDisconnect} disabled={saving} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700">
                    <Unlink className="h-3.5 w-3.5" /> {t("disconnect")}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConnect} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("facebookPageIdLabel")}</label>
                    <input required value={pageId} onChange={(e) => setPageId(e.target.value)} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder="e.g. 123456789012345" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("pageAccessTokenLabel")}</label>
                    <input required type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full rounded-full border border-gray-200 px-4 py-2.5 text-sm" placeholder="From the Meta Developer Portal" />
                    <p className="mt-1 text-xs text-gray-400">{t("pageAccessTokenHint")}</p>
                  </div>
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-[#005f63] hover:bg-[#004a4d] text-white px-5 py-2.5 rounded-full font-medium transition shadow-sm disabled:opacity-60">
                    <Link2 className="h-4 w-4" /> {saving ? t("connecting") : t("connectPage")}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-[#ddd5ca] bg-white overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-orange-400 to-yellow-300" />
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100">
              <QrCode className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#005f63]">{t("physicalQrIdTitle")}</h2>
              <p className="text-xs text-gray-500">{t("physicalQrIdDesc")}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            {t("physicalQrIdBody1")} <strong>{t("physicalQrIdToggleLabel")}</strong> {t("physicalQrIdBody2")}
            <strong> {t("scan")}</strong> {t("physicalQrIdBody3")}
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

      {error && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setError(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{error}</p>
            <button onClick={() => setError(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={() => setSuccess(null)}>
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[#005f63] flex justify-center"><CheckCircle size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{success}</p>
            <button onClick={() => setSuccess(null)} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
