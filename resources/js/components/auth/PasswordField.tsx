import { useState } from "react";
import EyeToggleIcon from "../ui/EyeToggleIcon";
import { PASSWORD_MAX } from "../../lib/passwordPolicy";
import { useLanguage } from "../../i18n/LanguageContext";

// One password input with a show/hide eye, used by every new security form so
// they all look and behave the same.
export default function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  disabled,
  invalid,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
}) {
  const { t } = useLanguage();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        maxLength={PASSWORD_MAX}
        className={`w-full rounded-full border bg-white/10 py-3.5 pl-5 pr-14 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/20 focus:border-[#4FBEB0]/50 disabled:opacity-50 ${
          invalid ? "border-red-400" : "border-white/25"
        }`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("memHidePassword") : t("memShowPassword")}
        aria-pressed={shown}
        className="absolute right-2.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40"
      >
        <EyeToggleIcon visible={shown} />
      </button>
    </div>
  );
}
