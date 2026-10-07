import { useState, useEffect, useRef } from "react";
import { KeyRound, Globe, Home, User, Phone, Pencil, Eye, EyeOff } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import { isStrongPassword, PASSWORD_MAX } from "../../../lib/passwordPolicy";
import { LANGUAGES } from "../../../i18n/translations";
import StatusModal from "../../../components/ui/StatusModal";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";
import Skeleton from "../../../components/ui/Skeleton";

interface SettingsViewProps {
  member: {
    id: string;
    name: string;
  };
}

export default function SettingsView({ member }: SettingsViewProps) {
  const { language, setLanguage, t } = useLanguage();
  const [profile, setProfile] = useState<any | null>(null);

  // Section switcher -- same pill-tab pattern as the staff Settings page
  // (Age & Status Categories): one focused card at a time, with a brief
  // skeleton flash on switch so the change reads as navigation.
  type SettingsTab = "profile" | "language" | "password";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [tabSwitching, setTabSwitching] = useState(false);
  const tabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTab = (next: SettingsTab) => {
    if (next === activeTab) return;
    setTabSwitching(true);
    setActiveTab(next);
    if (tabTimer.current) clearTimeout(tabTimer.current);
    tabTimer.current = setTimeout(() => setTabSwitching(false), 350);
  };
  useEffect(() => () => { if (tabTimer.current) clearTimeout(tabTimer.current); }, []);

  useEffect(() => {
    api.get("/me").then((res) => setProfile(res.data)).catch(() => setProfile(null));
  }, []);

  // ─── Edit contact number ────────────────────────────────────────────────
  const [editingContact, setEditingContact] = useState(false);
  const [contactValue, setContactValue]     = useState("");
  const [contactError, setContactError]     = useState("");
  const [contactSaving, setContactSaving]   = useState(false);
  const [confirmContactOpen, setConfirmContactOpen] = useState(false);

  // Nothing to save if the field still matches what's already on the
  // profile -- covers both "opened Edit and clicked Save without typing
  // anything" and "typed it back to the original value".
  const contactUnchanged = contactValue === (profile?.contact_number || "").replace(/\D/g, "");

  const openEditContact = () => {
    setContactValue((profile?.contact_number || "").replace(/\D/g, "").slice(0, 11));
    setContactError("");
    setEditingContact(true);
  };

  const requestSaveContact = () => {
    setContactError("");
    const digits = contactValue.replace(/\D/g, "");
    if (!digits) {
      setContactError(t("contactNumberRequired"));
      return;
    }
    if (!digits.startsWith("09")) {
      setContactError(t("contactNumberMustStart09"));
      return;
    }
    if (digits.length !== 11) {
      setContactError(t("mustBe11Digits"));
      return;
    }
    setConfirmContactOpen(true);
  };

  const handleSaveContact = async () => {
    setConfirmContactOpen(false);
    setContactSaving(true);
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");

      const res = await fetch(`/users/${member.id}/contact-number`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken && { "X-CSRF-TOKEN": csrfToken }),
        },
        body: JSON.stringify({ contact_number: contactValue.replace(/\D/g, "") }),
      });

      const data = await res.json();

      if (res.ok) {
        setProfile((prev: any) => ({ ...prev, contact_number: data.contact_number }));
        setEditingContact(false);
      } else {
        setContactError(data.errors?.contact_number?.[0] || data.message || t("updateFailed"));
      }
    } catch {
      setContactError(t("networkError"));
    } finally {
      setContactSaving(false);
    }
  };

  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError]               = useState("");
  const [pwSuccess, setPwSuccess]           = useState("");
  const [pwLoading, setPwLoading]           = useState(false);
  const [confirmPwOpen, setConfirmPwOpen]   = useState(false);
  const [showNewPw, setShowNewPw]           = useState(false);
  const [showConfirmPw, setShowConfirmPw]   = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const requestChangePassword = () => {
    setPwError("");
    setPwSuccess("");

    if (!isStrongPassword(newPassword)) {
      setPwError(t("passwordPolicyError"));
      return;
    }
    if (!passwordsMatch) {
      setPwError(t("passwordsMismatchError"));
      return;
    }

    setConfirmPwOpen(true);
  };

  const handleChangePassword = async () => {
    setConfirmPwOpen(false);
    setPwLoading(true);
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");

      const res = await fetch(`/users/${member.id}/change-password`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken && { "X-CSRF-TOKEN": csrfToken }),
        },
        body: JSON.stringify({
          new_password:              newPassword,
          new_password_confirmation: confirmPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPwSuccess(t("passwordUpdatedSuccess"));
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPwError(data.message || t("updateFailed"));
      }
    } catch {
      setPwError(t("networkError"));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="-m-3 sm:-m-5 min-h-[calc(100vh-73px)] bg-[#0A0E1A] p-4 sm:p-8">
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{t("settings")}</h1>
        <p className="mt-1.5 text-sm text-white/50 max-w-xl">{t("memberSettingsSubtitle")}</p>
      </div>

      {/* Section switcher -- standalone pill buttons, same as the staff
          Settings page. */}
      <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => switchTab("profile")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
              activeTab === "profile"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <User className="h-4 w-4" />
            {t("myProfile")}
          </button>
          <button
            type="button"
            onClick={() => switchTab("language")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
              activeTab === "language"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <Globe className="h-4 w-4" />
            {t("language")}
          </button>
          <button
            type="button"
            onClick={() => switchTab("password")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition ${
              activeTab === "password"
                ? "bg-sage-700 text-white shadow-sm"
                : "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            {t("changePassword")}
          </button>
      </div>

      {tabSwitching && (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
          <div className="p-10 space-y-3">
            <Skeleton className="h-8 w-1/3" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-full" />
            ))}
          </div>
        </div>
      )}
      {/* PROFILE / HOUSEHOLD INFO — UC-5 profiling display. Darkened like
          every other core content/edit card in the app -- this is where the
          resident actually edits their own contact number. */}
      {activeTab === "profile" && !tabSwitching && (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#4FBEB0]" />
            <h2 className="text-3xl font-black text-white">{t("myProfile")}</h2>
          </div>

          {!profile ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-full" />
              ))}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between rounded-full bg-white/[0.04] border border-white/10 px-5 py-3">
                <span className="text-sm text-white/50">{t("addressLabel")}</span>
                <span className="text-sm font-semibold text-white">{profile.address || t("notSet")}</span>
              </div>

              {/* Contact number -- the one field on this card residents can
                  actually edit themselves; everything else here (address,
                  age, household) is set by Staff during profiling. */}
              <div className={`bg-white/[0.04] border border-white/10 px-5 py-3 ${editingContact ? "rounded-2xl" : "rounded-full"}`}>
                {!editingContact ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-white/50">
                      <Phone className="h-3.5 w-3.5" /> {t("contactNumberLabel")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{profile.contact_number || t("notSet")}</span>
                      <button
                        onClick={openEditContact}
                        title={t("editLabel")}
                        className="p-1 rounded-full text-white/40 hover:text-[#4FBEB0] hover:bg-white/10 transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm text-white/50">{t("contactNumberLabel")}</span>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="tel"
                        value={contactValue}
                        onChange={(e) => setContactValue(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        inputMode="numeric"
                        maxLength={11}
                        placeholder={t("contactNumberPlaceholder")}
                        disabled={contactSaving}
                        className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 disabled:opacity-50"
                      />
                      <button
                        onClick={requestSaveContact}
                        disabled={contactSaving || !contactValue.trim() || contactUnchanged}
                        className="shrink-0 rounded-full bg-sage-700 hover:bg-sage-800 text-white text-sm font-semibold px-4 disabled:opacity-50 transition"
                      >
                        {contactSaving ? t("savingLabel") : t("saveLabel")}
                      </button>
                      <button
                        onClick={() => setEditingContact(false)}
                        disabled={contactSaving}
                        className="shrink-0 rounded-full border border-white/15 text-white/60 hover:bg-white/5 text-sm font-medium px-4 disabled:opacity-50 transition"
                      >
                        {t("cancelLabel")}
                      </button>
                    </div>
                    {contactValue.length > 0 && !contactValue.startsWith("09") && (
                      <p className="mt-1.5 px-2 text-xs text-red-400">{t("contactNumberMustStart09")}</p>
                    )}
                    {contactValue.startsWith("09") && contactValue.length < 11 && (
                      <p className="mt-1.5 px-2 text-xs text-white/50">{contactValue.length}/11</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-full bg-white/[0.04] border border-white/10 px-5 py-3">
                <span className="text-sm text-white/50">{t("ageLabel")}</span>
                <span className="text-sm font-semibold text-white">
                  {profile.age != null ? `${profile.age} ${t("yrsOld")}` : t("notSet")}
                  {profile.age_group ? ` · ${profile.age_group}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-full bg-white/[0.04] border border-white/10 px-5 py-3">
                <span className="flex items-center gap-1.5 text-sm text-white/50">
                  <Home className="h-3.5 w-3.5" /> {t("householdLabel")}
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  {profile.household ? profile.household.code : t("notSet")}
                  {profile.is_household_head && (
                    <span className="rounded-full bg-gold-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-300">
                      {t("headBadge")}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* LANGUAGE — UC-17 Switch Interface Language */}
      {activeTab === "language" && !tabSwitching && (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#4FBEB0]" />
            <h2 className="text-3xl font-black text-white">{t("language")}</h2>
          </div>
          <p className="mt-2 text-sm text-white/50">{t("languageSectionDesc")}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {LANGUAGES.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setLanguage(opt.code, { userId: member.id })}
                className={`rounded-full border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  language === opt.code
                    ? "border-[#4FBEB0] bg-[#4FBEB0]/10 text-[#7DD8CB]"
                    : "border-white/15 text-white/60 hover:border-[#4FBEB0]/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* CHANGE PASSWORD */}
      {activeTab === "password" && !tabSwitching && (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#4FBEB0]" />
            <h2 className="text-3xl font-black text-white">{t("changePassword")}</h2>
          </div>

          <div className="mt-6 space-y-4">

            <div>
              <div className="relative">
              <input
                type={showNewPw ? "text" : "password"}
                placeholder={t("newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwLoading}
                maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                className="w-full rounded-full border border-white/15 bg-white/10 pl-4 pr-14 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                aria-label={showNewPw ? t("memHidePassword") : t("memShowPassword")}
                aria-pressed={showNewPw}
                title={showNewPw ? t("memHidePassword") : t("memShowPassword")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 transition"
              >
                {showNewPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              </div>
              <p className="mt-1.5 px-2 text-xs text-white/50">{t("passwordPolicyError")}</p>
            </div>

            <div>
              <div className="relative">
              <input
                type={showConfirmPw ? "text" : "password"}
                placeholder={t("confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwLoading}
                maxLength={PASSWORD_MAX}
                className={`w-full rounded-full border pl-4 pr-14 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  passwordsMismatch
                    ? "border-red-500/40 focus:ring-red-400/30 bg-red-500/10"
                    : passwordsMatch
                    ? "border-[#4FBEB0]/50 focus:ring-[#4FBEB0]/30 bg-[#4FBEB0]/10"
                    : "border-white/15 bg-white/10 focus:ring-[#4FBEB0]/40"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw((v) => !v)}
                aria-label={showConfirmPw ? t("memHidePassword") : t("memShowPassword")}
                aria-pressed={showConfirmPw}
                title={showConfirmPw ? t("memHidePassword") : t("memShowPassword")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 transition"
              >
                {showConfirmPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              </div>
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-400 font-medium px-2">
                  ✗ {t("passwordsDoNotMatch")}
                </p>
              )}
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-[#7DD8CB] font-medium px-2">
                  ✓ {t("passwordsMatchNote")}
                </p>
              )}
            </div>

            <button
              onClick={requestChangePassword}
              disabled={pwLoading || !passwordsMatch}
              className="w-full rounded-full bg-sage-700 py-3 font-bold text-white hover:bg-sage-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pwLoading ? t("updating") : t("updatePassword")}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Peripheral alert modals -- the shared StatusModal, same as every
          other page's success/warning/error popups. The contact-number save
          error used to render as raw inline text (including a raw backend
          exception message when the input was too long for the column) right
          under the Save/Cancel buttons -- moved to the same popup every other
          error on this page already uses, for consistency and so a long
          backend message doesn't run into the buttons above it. */}
      <StatusModal open={!!contactError} type="error" title={t("errorLabel")} message={contactError} okLabel={t("okLabel")} onClose={() => setContactError("")} />
      <StatusModal open={!!pwError} type="error" title={t("errorLabel")} message={pwError} okLabel={t("okLabel")} onClose={() => setPwError("")} />
      <StatusModal open={!!pwSuccess} type="success" title={t("successTitle")} message={pwSuccess} okLabel={t("okLabel")} onClose={() => setPwSuccess("")} />

      <ConfirmDialog
        open={confirmContactOpen}
        icon={<Phone size={32} />}
        title={t("confirmUpdateContactTitle")}
        body={t("confirmUpdateContactBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setConfirmContactOpen(false)}
        onConfirm={handleSaveContact}
      />

      <ConfirmDialog
        open={confirmPwOpen}
        icon={<KeyRound size={32} />}
        title={t("confirmUpdatePasswordTitle")}
        body={t("confirmUpdatePasswordBody")}
        cancelLabel={t("cancelLabel")}
        confirmLabel={t("yesUpdate")}
        onCancel={() => setConfirmPwOpen(false)}
        onConfirm={handleChangePassword}
      />
    </div>
    </div>
  );
}
