import { useState, useEffect } from "react";
import { KeyRound, Globe, Home, User, Phone, XCircle, CheckCircle, Pencil } from "lucide-react";
import api from "../../../lib/api";
import { useLanguage } from "../../../i18n/LanguageContext";
import { LANGUAGES } from "../../../i18n/translations";

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

  const openEditContact = () => {
    setContactValue(profile?.contact_number || "");
    setContactError("");
    setEditingContact(true);
  };

  const handleSaveContact = async () => {
    setContactError("");
    if (!contactValue.trim()) {
      setContactError(t("contactNumberRequired"));
      return;
    }

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

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleChangePassword = async () => {
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
    <div className="max-w-xl space-y-8">
      {/* PROFILE / HOUSEHOLD INFO — UC-5 profiling display */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#005f63]" />
            <h2 className="text-3xl font-black text-[#005f63]">{t("myProfile")}</h2>
          </div>

          {!profile ? (
            <p className="mt-6 text-sm text-gray-400">{t("loadingProfile")}</p>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between rounded-full bg-gray-50 px-5 py-3">
                <span className="text-sm text-gray-500">{t("addressLabel")}</span>
                <span className="text-sm font-semibold text-[#005f63]">{profile.address || t("notSet")}</span>
              </div>

              {/* Contact number -- the one field on this card residents can
                  actually edit themselves; everything else here (address,
                  age, household) is set by Staff during profiling. */}
              <div className={`rounded-2xl bg-gray-50 px-5 py-3 ${editingContact ? "" : "rounded-full"}`}>
                {!editingContact ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Phone className="h-3.5 w-3.5" /> {t("contactNumberLabel")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#005f63]">{profile.contact_number || t("notSet")}</span>
                      <button
                        onClick={openEditContact}
                        title={t("editLabel")}
                        className="p-1 rounded-full text-gray-400 hover:text-[#005f63] hover:bg-white transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm text-gray-500">{t("contactNumberLabel")}</span>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="tel"
                        value={contactValue}
                        onChange={(e) => setContactValue(e.target.value)}
                        placeholder={t("contactNumberPlaceholder")}
                        disabled={contactSaving}
                        className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9acace] disabled:opacity-50"
                      />
                      <button
                        onClick={handleSaveContact}
                        disabled={contactSaving || !contactValue.trim()}
                        className="shrink-0 rounded-full bg-[#2cb7b7] hover:bg-[#41d1d1] text-white text-sm font-semibold px-4 disabled:opacity-50"
                      >
                        {contactSaving ? t("savingLabel") : t("saveLabel")}
                      </button>
                      <button
                        onClick={() => setEditingContact(false)}
                        disabled={contactSaving}
                        className="shrink-0 rounded-full border border-gray-200 text-gray-500 text-sm font-medium px-4 disabled:opacity-50"
                      >
                        {t("cancelLabel")}
                      </button>
                    </div>
                    {contactError && <p className="mt-1.5 text-xs text-red-500 font-medium px-2">{contactError}</p>}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-full bg-gray-50 px-5 py-3">
                <span className="text-sm text-gray-500">{t("ageLabel")}</span>
                <span className="text-sm font-semibold text-[#005f63]">
                  {profile.age != null ? `${profile.age} ${t("yrsOld")}` : t("notSet")}
                  {profile.age_group ? ` · ${profile.age_group}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-full bg-gray-50 px-5 py-3">
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Home className="h-3.5 w-3.5" /> {t("householdLabel")}
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-[#005f63]">
                  {profile.household_code || t("notSet")}
                  {profile.is_household_head && (
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600">
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
      <div className="overflow-hidden rounded-3xl bg-white shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#005f63]" />
            <h2 className="text-3xl font-black text-[#005f63]">{t("language")}</h2>
          </div>
          <p className="mt-2 text-sm text-gray-500">{t("languageSectionDesc")}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {LANGUAGES.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setLanguage(opt.code, { userId: member.id })}
                className={`rounded-full border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  language === opt.code
                    ? "border-[#2cb7b7] bg-[#2cb7b7]/10 text-[#005f63]"
                    : "border-gray-200 text-gray-500 hover:border-[#9acace]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CHANGE PASSWORD — TEAL THEME MATCHING PROFILE SETTINGS */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-[8px_8px_6px_rgba(0,0,0,0.10)] hover:shadow-[12px_12px_18px_rgba(0,0,0,0.20)] transition-shadow duration-300">
        <div className="h-1.5 bg-gradient-to-r from-[#067a7a] via-[#3ec5c5] to-orange-300" />
        <div className="p-10">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#005f63]" />
            <h2 className="text-3xl font-black text-[#005f63]">{t("changePassword")}</h2>
          </div>

          <div className="mt-6 space-y-4">

            <div>
              <input
                type="password"
                placeholder={t("newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwLoading}
                className="w-full rounded-full border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#9acace] disabled:opacity-50"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder={t("confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwLoading}
                className={`w-full rounded-full border px-4 py-3 focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
                  passwordsMismatch
                    ? "border-red-400 focus:ring-red-300 bg-red-50"
                    : passwordsMatch
                    ? "border-green-400 focus:ring-green-300 bg-green-50"
                    : "border-gray-200 focus:ring-[#9acace]"
                }`}
              />
              {passwordsMismatch && (
                <p className="mt-1.5 text-xs text-red-500 font-medium px-2">
                  ✗ {t("passwordsDoNotMatch")}
                </p>
              )}
              {passwordsMatch && (
                <p className="mt-1.5 text-xs text-green-600 font-medium px-2">
                  ✓ {t("passwordsMatchNote")}
                </p>
              )}
            </div>

            <button
              onClick={handleChangePassword}
              disabled={pwLoading || !passwordsMatch}
              className="w-full rounded-full bg-[#2cb7b7] py-3 font-semibold text-white hover:bg-[#41d1d1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pwLoading ? t("updating") : t("updatePassword")}
            </button>
          </div>
        </div>
      </div>

      {pwError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-red-500 flex justify-center"><XCircle size={40} /></div>
            <h3 className="text-xl font-bold text-red-600 mb-2">{t("errorLabel")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{pwError}</p>
            <button onClick={() => setPwError("")} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}

      {pwSuccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[30px] w-full max-w-md p-6 shadow-2xl text-center">
            <div className="mb-3 text-[#005f63] flex justify-center"><CheckCircle size={40} /></div>
            <h3 className="text-xl font-bold text-[#005f63] mb-2">{t("successTitle")}</h3>
            <p className="text-[15px] text-gray-600 mb-6">{pwSuccess}</p>
            <button onClick={() => setPwSuccess("")} className="px-6 py-2.5 rounded-full bg-[#005f63] hover:bg-[#004a4d] text-white transition">
              {t("okLabel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
