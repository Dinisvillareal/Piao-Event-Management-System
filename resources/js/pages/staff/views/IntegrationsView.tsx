import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, QrCode, CheckCircle2, Link2, Unlink } from "lucide-react";
import EyeToggleIcon from "../../../components/ui/EyeToggleIcon";
import api, { apiErrorMessage } from "../../../lib/api";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import StatusModal from "../../../components/ui/StatusModal";
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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Section switcher -- same pill-tab pattern as the other Settings-style
  // pages: one focused card at a time, with a brief skeleton flash on switch.
  type IntegrationTab = "facebook" | "qr";
  const [activeTab, setActiveTab] = useState<IntegrationTab>("facebook");
  const [tabSwitching, setTabSwitching] = useState(false);
  const tabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTab = (next: IntegrationTab) => {
    if (next === activeTab) return;
    setTabSwitching(true);
    setActiveTab(next);
    if (tabTimer.current) clearTimeout(tabTimer.current);
    tabTimer.current = setTimeout(() => setTabSwitching(false), 350);
  };
  useEffect(() => () => { if (tabTimer.current) clearTimeout(tabTimer.current); }, []);

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
    setConfirmDisconnect(false);
    setSaving(true);
    try {
      await api.delete("/integrations/facebook");
      setSuccess(t("fbDisconnectedSuccess"));
      load();
    } catch (e) {
      setError(apiErrorMessage(e, t("disconnectFailed")));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-sans text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50";
  const cardCls = "overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]";
  const tabCls = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
      on
        ? "bg-sage-700 text-white shadow-sm"
        : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
    }`;

  return (
    /* Dark-navy full-bleed page + pill tabs, same "moduling" as the Age &
       Status Categories settings page, instead of the old light paper cards. */
    <div className="-m-3 sm:-m-6 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
      <div className="space-y-5 max-w-2xl">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("integrations")}</h1>
          <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("integrationsSubtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => switchTab("facebook")} className={tabCls(activeTab === "facebook")}>
            <MessageCircle className="h-4 w-4" />
            {t("facebookPageTitle")}
            {!loading && status?.connected && (
              <span className="h-2 w-2 rounded-full bg-[#7DD8CB]" title={t("connectedToPageId")} aria-hidden="true" />
            )}
          </button>
          <button type="button" onClick={() => switchTab("qr")} className={tabCls(activeTab === "qr")}>
            <QrCode className="h-4 w-4" />
            {t("physicalQrIdTitle")}
          </button>
        </div>

        {tabSwitching && (
          <div className={cardCls}>
            <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
            <div className="p-5 sm:p-6 space-y-3">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-11 w-full rounded-full" />
              <Skeleton className="h-11 w-full rounded-full" />
            </div>
          </div>
        )}

        {activeTab === "facebook" && !tabSwitching && (
          <div className={cardCls}>
            <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/15">
                  <MessageCircle className="h-5 w-5 text-[#6AA9FF]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-white">{t("facebookPageTitle")}</h2>
                  <p className="mt-0.5 text-sm text-white/50">{t("facebookPageDesc")}</p>
                </div>
              </div>

              {loading ? (
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-10 w-full rounded-full" />
                  <Skeleton className="h-10 w-full rounded-full" />
                  <Skeleton className="h-11 w-40 rounded-full" />
                </div>
              ) : (
                <div className="mt-5">
                  {status?.connected ? (
                    <div className="rounded-2xl border border-[#4FBEB0]/30 bg-[#4FBEB0]/[0.08] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-[#7DD8CB] text-sm font-semibold">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        {t("connectedToPageId")} {status.page_id}
                      </div>
                      <button
                        onClick={() => setConfirmDisconnect(true)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition disabled:opacity-60"
                      >
                        <Unlink className="h-4 w-4" /> {t("disconnect")}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleConnect} noValidate className="space-y-5">
                      <div>
                        <label className="block text-sm font-semibold text-white mb-1.5">{t("facebookPageIdLabel")}</label>
                        <input required value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputCls} placeholder="e.g. 123456789012345" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-white mb-1.5">{t("pageAccessTokenLabel")}</label>
                        <div className="relative">
                          <input
                            required
                            type={showToken ? "text" : "password"}
                            autoComplete="off"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            className={`${inputCls} pr-14`}
                            placeholder={t("opsMetaTokenPlaceholder")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            aria-label={showToken ? t("opsHideToken") : t("opsShowToken")}
                            aria-pressed={showToken}
                            title={showToken ? t("opsHideToken") : t("opsShowToken")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 transition"
                          >
                            <EyeToggleIcon visible={showToken} />
                          </button>
                        </div>
                        <p className="mt-2 text-sm text-white/50">{t("pageAccessTokenHint")}</p>
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-bold px-6 py-2.5 transition shadow-sm disabled:opacity-60"
                      >
                        <Link2 className="h-5 w-5" /> {saving ? t("connecting") : t("connectPage")}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "qr" && !tabSwitching && (
          <div className={cardCls}>
            <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400/15">
                  <QrCode className="h-5 w-5 text-gold-300" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-white">{t("physicalQrIdTitle")}</h2>
                  <p className="mt-0.5 text-sm text-white/50">{t("physicalQrIdDesc")}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {t("physicalQrIdBody1")} <strong className="text-white">{t("physicalQrIdToggleLabel")}</strong> {t("physicalQrIdBody2")}
                <strong className="text-white"> {t("scan")}</strong> {t("physicalQrIdBody3")}
              </p>
            </div>
          </div>
        )}
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

      <ConfirmDialog
        open={confirmDisconnect}
        tone="danger"
        icon={<Unlink size={32} />}
        title={t("confirmDisconnectFbTitle")}
        body={t("confirmDisconnectFbBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesDisconnect")}
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={handleDisconnect}
      />

      {/* Shared StatusModal -- same dark success/error popups as every other page. */}
      <StatusModal open={!!error} type="error" title={t("errorTitle")} message={error ?? ""} okLabel={t("okLabel")} onClose={() => setError(null)} />
      <StatusModal open={!!success} type="success" title={t("successTitle")} message={success ?? ""} okLabel={t("okLabel")} onClose={() => setSuccess(null)} />
    </div>
  );
}
