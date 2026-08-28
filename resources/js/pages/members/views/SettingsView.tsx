import { useState, useEffect } from "react";
import { KeyRound, Globe, Home, User } from "lucide-react";
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
            {pwError && (
              <div className="rounded-full bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="rounded-full bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-600">
                {pwSuccess}
              </div>
            )}

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
    </div>
  );
}
