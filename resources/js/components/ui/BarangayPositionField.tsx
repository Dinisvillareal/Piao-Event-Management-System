import { BadgeCheck } from "lucide-react";
import FormSelect from "./FormSelect";
import type { BarangayOfficials } from "../../lib/barangayOfficials";

export type BarangayPositionValue = "" | "captain" | "secretary";

interface Props {
  value: BarangayPositionValue;
  onChange: (value: BarangayPositionValue) => void;
  /** Who holds each post right now (from /barangay-officials). */
  officials: BarangayOfficials;
  /** The resident being edited (their own post isn't a conflict). */
  selfId?: number;
  t: (key: string) => string;
}

/**
 * "Barangay Position" picker for the Add / Edit resident forms. Marks the
 * resident as the Barangay Captain or Secretary so reports and the ID card use
 * their name automatically. Each post has a single holder: while someone holds
 * it, it cannot be picked for anyone else. To appoint a new Captain/Secretary,
 * first set the current one's position to None.
 */
export default function BarangayPositionField({ value, onChange, officials, selfId, t }: Props) {
  const takenBy = (post: "captain" | "secretary") => {
    const h = officials[post];
    return h && h.id !== selfId ? h : null;
  };
  const captainHolder = takenBy("captain");
  const secretaryHolder = takenBy("secretary");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4FBEB0]/15 text-[#7DD8CB]">
          <BadgeCheck className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold text-white">
            {t("barangayPositionLabel")} <span className="font-normal text-white/50">({t("optionalLabel")})</span>
          </p>
          <p className="mt-0.5 text-sm text-white/50">{t("barangayPositionHint")}</p>
        </div>
      </div>

      <div className="mt-4 max-w-md">
        <FormSelect
          disabled={!!captainHolder && !!secretaryHolder && value === ""}
          value={value || "__none"}
          onChange={(e) => onChange((e.target.value === "__none" ? "" : e.target.value) as BarangayPositionValue)}
        >
          <option value="__none">{t("noneOption")}</option>
          <option value="captain" disabled={!!captainHolder} data-hint={captainHolder ? t("positionTakenTag") : undefined}>{t("positionCaptain")}</option>
          <option value="secretary" disabled={!!secretaryHolder} data-hint={secretaryHolder ? t("positionTakenTag") : undefined}>{t("positionSecretary")}</option>
        </FormSelect>
      </div>

    </div>
  );
}
