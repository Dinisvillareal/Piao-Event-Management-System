import { useState, useEffect, useRef } from "react";
import { KeyRound, Globe, Home, User, Phone, Pencil, ChevronRight } from "lucide-react";
import ChangePasswordForm from "../../../components/auth/ChangePasswordForm";
import SectionCard from "../../../components/ui/SectionCard";
import SpeedDial from "../../../components/ui/SpeedDial";
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
  const initials = (member.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "R";

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

  const [pwSuccess, setPwSuccess] = useState("");

  return (
    <div className="h-[calc(100dvh-73px)] overflow-y-auto dash-canvas p-4 sm:p-8">
    <div className="space-y-6">
      <div className="dash-card rounded-[32px] p-5 sm:p-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl page-title-gradient page-title-fit">{t("settings")}</h1>
        <p className="mt-1.5 text-sm text-white/55 max-w-xl">{t("memberSettingsSubtitle")}</p>
      </div>

      <SpeedDial
        value={activeTab}
        items={[
          { key: "profile", label: t("myProfile"), icon: User, onSelect: () => switchTab("profile") },
          { key: "language", label: t("language"), icon: Globe, onSelect: () => switchTab("language") },
          { key: "password", label: t("changePassword"), icon: KeyRound, onSelect: () => switchTab("password") },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      {/* Left: who you are, and the menu -- same card as the staff My Account page. */}
      <aside className="lg:sticky lg:top-4">
        <section className="dash-card relative overflow-hidden rounded-3xl">
          <div
            className="absolute inset-x-0 top-0 h-[270px] bg-gradient-to-br from-[#0F2A4A] via-[#135863] to-[#2E8E82]"
            style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)" }}
          >
            {profile?.validation_id_url ? (
              <img src={profile.validation_id_url} alt="" className="h-full w-full object-cover object-[50%_14%]" />
            ) : (
              <div className="flex h-full w-full items-start justify-center pt-8">
                {profile ? (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gold-400 text-4xl font-extrabold text-[#08130F] ring-4 ring-white/80 shadow-xl">{initials}</div>
                ) : (
                  <Skeleton className="h-28 w-28 !rounded-full" />
                )}
              </div>
            )}
          </div>

          <div className="relative z-10 space-y-3.5 px-4 pb-4 pt-[168px]">
            <div className="profile-glass rounded-2xl px-5 py-5 text-center">
              <h2 className="break-words font-display text-2xl font-extrabold leading-tight text-white">{member.name}</h2>
              <p className="mt-1 font-mono text-sm text-white/55">{profile?.user_code ?? ""}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#4FBEB0]/15 px-2.5 py-0.5 text-xs font-bold text-[#2E8E82]">{t("memberRole")}</span>
            </div>

            {profile && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="min-w-0 rounded-2xl border border-white/20 bg-white/10 px-2 py-3 text-center backdrop-blur-xl">
                  <p className="text-2xl font-black leading-tight text-white">{profile.age != null ? profile.age : "—"}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-white/60">{t("ageLabel")}</p>
                  <span className="mx-auto mt-1.5 block h-1 w-8 rounded-full bg-[#4FBEB0]" />
                </div>
                <div className="min-w-0 rounded-2xl border border-white/20 bg-white/10 px-2 py-3 text-center backdrop-blur-xl">
                  <p className="truncate text-2xl font-black leading-tight text-white">{profile.household ? profile.household.code : "—"}</p>
                  <p className="mt-0.5 truncate text-xs font-medium text-white/60">{t("householdLabel")}</p>
                  <span className="mx-auto mt-1.5 block h-1 w-8 rounded-full bg-gold-400" />
                </div>
              </div>
            )}

            <nav className="rounded-2xl border border-white/20 bg-white/[0.06] p-2 backdrop-blur-xl max-sm:hidden">
              {([
                { key: "profile" as const, label: t("myProfile"), icon: User },
                { key: "language" as const, label: t("language"), icon: Globe },
                { key: "password" as const, label: t("changePassword"), icon: KeyRound },
              ]).map((it) => {
                const on = activeTab === it.key;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => switchTab(it.key)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition ${on ? "bg-gradient-to-r from-[#0B0F14] to-[#18212B] !text-white shadow-sm" : "text-white/75 hover:bg-[#4FBEB0]/[0.08] hover:text-white"}`}
                  >
                    <it.icon className={`h-[18px] w-[18px] shrink-0 ${on ? "text-white" : "text-[#2E8E82]"}`} />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    <ChevronRight className={`h-4 w-4 shrink-0 ${on ? "text-white/70" : "text-white/30"}`} />
                  </button>
                );
              })}
            </nav>
          </div>
        </section>
      </aside>

      <div className="min-w-0 space-y-6">
      {/* PROFILE / HOUSEHOLD INFO — UC-5 profiling display. Darkened like
          every other core content/edit card in the app -- this is where the
          resident actually edits their own contact number. */}
      {activeTab === "profile" && (
      <div className="dash-card overflow-hidden rounded-[28px]">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#2E8E82]/30 bg-[#2E8E82]/15">
              <User className="h-5 w-5 text-[#2E8E82]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">{t("myProfile")}</h2>
              <p className="mt-0.5 text-sm text-white/50">{t("memProfileDesc")}</p>
            </div>
          </div>

          {!profile || tabSwitching ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-full" />
              ))}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3 dash-field rounded-full max-sm:rounded-2xl px-5 py-3">
                <span className="text-sm text-white/50">{t("addressLabel")}</span>
                <span className="min-w-0 break-words text-right text-sm font-semibold text-white">{profile.address || t("notSet")}</span>
              </div>

              {/* Contact number -- the one field on this card residents can
                  actually edit themselves; everything else here (address,
                  age, household) is set by Staff during profiling. */}
              <div className={`dash-field px-5 py-3 ${editingContact ? "rounded-2xl" : "rounded-full"}`}>
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/40 hover:text-[#4FBEB0] hover:bg-white/10 transition sm:h-8 sm:w-8"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm text-white/50">{t("contactNumberLabel")}</span>
                    <div className="mt-2 flex gap-2 max-sm:flex-wrap">
                      <input
                        type="tel"
                        value={contactValue}
                        onChange={(e) => setContactValue(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        inputMode="numeric"
                        maxLength={11}
                        placeholder={t("contactNumberPlaceholder")}
                        disabled={contactSaving}
                        className="min-w-0 flex-1 max-sm:basis-full rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#4FBEB0]/40 focus:border-[#4FBEB0]/70 disabled:opacity-50"
                      />
                      <button
                        onClick={requestSaveContact}
                        disabled={contactSaving || !contactValue.trim() || contactUnchanged}
                        className="shrink-0 rounded-full bg-gradient-to-r from-[#0B0F14] to-[#18212B] hover:brightness-125 !text-white text-sm font-semibold px-4 disabled:opacity-50 transition"
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

              <div className="flex items-center justify-between gap-3 dash-field rounded-full max-sm:rounded-2xl px-5 py-3">
                <span className="text-sm text-white/50">{t("ageLabel")}</span>
                <span className="text-sm font-semibold text-white">
                  {profile.age != null ? `${profile.age} ${t("yrsOld")}` : t("notSet")}
                  {profile.age_group ? ` · ${profile.age_group}` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 dash-field rounded-full max-sm:rounded-2xl px-5 py-3">
                <span className="flex items-center gap-1.5 text-sm text-white/50">
                  <Home className="h-3.5 w-3.5" /> {t("householdLabel")}
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  {profile.household ? profile.household.code : t("notSet")}
                  {profile.is_household_head && (
                    <span className="rounded-full bg-gold-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-300">
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
      {activeTab === "language" && (
      <div className="dash-card overflow-hidden rounded-[28px]">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#2E8E82]/30 bg-[#2E8E82]/15">
              <Globe className="h-5 w-5 text-[#2E8E82]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">{t("language")}</h2>
              <p className="mt-0.5 text-sm text-white/50">{t("languageSectionDesc")}</p>
            </div>
          </div>

          {tabSwitching && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-full" />
              ))}
            </div>
          )}
          <div className={tabSwitching ? "hidden" : "mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"}>
            {LANGUAGES.map((opt) => (
              <button
                key={opt.code}
                onClick={() => setLanguage(opt.code, { userId: member.id })}
                className={`rounded-full border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  language === opt.code
                    ? "border-[#2E8E82] bg-[#4FBEB0]/10 text-[#2E8E82]"
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

      {/* CHANGE PASSWORD -- same shared form and card as the staff My Account page. */}
      {activeTab === "password" && (
        <SectionCard icon={<KeyRound className="h-5 w-5" />} title={t("changePassword")} desc={t("memPasswordDesc")}>
          {tabSwitching ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-full" />
              ))}
            </div>
          ) : (
            <ChangePasswordForm userId={member.id} onDone={() => setPwSuccess(t("passwordUpdatedSuccess"))} />
          )}
        </SectionCard>
      )}

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

    </div>
    </div>
  );
}
