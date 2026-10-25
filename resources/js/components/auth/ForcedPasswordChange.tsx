import { ShieldAlert } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import ChangePasswordForm from "./ChangePasswordForm";

// Shown instead of the app when an account has to choose its own password
// first (after a staff-issued temporary password). Nothing else works until
// it's done -- the server enforces that too.
export default function ForcedPasswordChange({ userId, minLength = 8 }: { userId: number | string; minLength?: number }) {
  const { t } = useLanguage();

  const signOut = async () => {
    try {
      const token = document.cookie.split("; ").find((r) => r.startsWith("XSRF-TOKEN="))?.split("=")[1];
      await fetch("/logout", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...(token && { "X-XSRF-TOKEN": decodeURIComponent(token) }) },
      });
    } catch { /* ignore */ }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0E1A] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-white/[0.05] p-8 shadow-2xl sm:p-10">
        <div className="mb-5 flex justify-center text-gold-300"><ShieldAlert size={44} /></div>
        <h1 className="text-center font-display text-3xl font-extrabold tracking-tight text-white">{t("secChooseNewPasswordTitle")}</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base text-white/60">{t("secChooseNewPasswordBody")}</p>
        <div className="mt-8">
          <ChangePasswordForm
            userId={userId}
            minLength={minLength}
            currentLabel={t("secTemporaryPassword")}
            onDone={() => { window.location.reload(); }}
            submitLabel={t("secSetNewPassword")}
          />
        </div>
        <button type="button" onClick={signOut} className="mx-auto mt-6 block text-sm font-semibold text-white/55 transition hover:text-white">{t("signOut")}</button>
      </div>
    </div>
  );
}
