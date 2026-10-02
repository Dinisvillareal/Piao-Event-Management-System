import { useState, useEffect } from "react";
import { KeyRound, Globe, Home, User, Phone, Pencil } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
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
  const contactUnchanged = contactValue.trim() === (profile?.contact_number || "").trim();

  const openEditContact = () => {
    setContactValue(profile?.contact_number || "");
    setContactError("");
    setEditingContact(true);
  };

  const requestSaveContact = () => {
    setContactError("");
    if (!contactValue.trim()) {
      setContactError(t("contactNumberRequired"));
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
        body: JSON.stringify({ contact_number: contactValue }),
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

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const requestChangePassword = () => {
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 8) {
      setPwError(t("passwordMinLength"));
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
    <div className="max-w-xl space-y-8">
      {/* PROFILE / HOUSEHOLD INFO — UC-5 profiling display. Darkened like
          every other core content/edit card in the app -- this is where the
          resident actually edits their own contact number. */}
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
                        onChange={(e) => setContactValue(e.target.value)}
                        placeholder={t("contactNumberPlaceholder")}
                        disabled={contactSaving}
                        className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 disabled:opacity-50"
                      />
                      <button
                        onClick={requestSaveContact}
                        disabled={contactSaving || !contactValue.trim() || contactUnchanged}
                        className="shrink-0 rounded-full bg-gold-400 hover:bg-gold-300 text-[#08130F] text-sm font-semibold px-4 disabled:opacity-50 transition"
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

      {/* LANGUAGE — UC-17 Switch Interface Language */}
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

      {/* CHANGE PASSWORD */}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-gold-400 via-[#E8B84A] to-[#4FBEB0]" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#4FBEB0]" />
            <h2 className="text-3xl font-black text-white">{t("changePassword")}</h2>
          </div>

          <div className="mt-6 space-y-4">

            <div>
              <input
                type="password"
                placeholder={t("newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwLoading}
                className="w-full rounded-full border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 disabled:opacity-50"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder={t("confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwLoading}
                className={`w-full rounded-full border px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  passwordsMismatch
                    ? "border-red-500/40 focus:ring-red-400/30 bg-red-500/10"
                    : passwordsMatch
                    ? "border-[#4FBEB0]/50 focus:ring-[#4FBEB0]/30 bg-[#4FBEB0]/10"
                    : "border-white/15 bg-white/10 focus:ring-[#4FBEB0]/40"
                }`}
              />
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
              className="w-full rounded-full bg-gold-400 py-3 font-bold text-[#08130F] hover:bg-gold-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pwLoading ? t("updating") : t("updatePassword")}
            </button>
          </div>
        </div>
      </div>

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
