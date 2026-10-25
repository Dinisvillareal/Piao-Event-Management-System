import { translate } from "../i18n/translations";

export const ABSENCE_REASON_KEYS = ["schedule", "sick", "not_informed", "no_transport", "work_family", "not_interested", "other"] as const;
export type AbsenceReasonKey = (typeof ABSENCE_REASON_KEYS)[number];

// Staff alerts carry the reason as its English label; map it back to the key
// so it can be shown in the viewer's own language.
export const absenceKeyFromLabel = (label?: string | null): string | null =>
  ABSENCE_REASON_KEYS.find((k) => translate(`absReason_${k}`, "en") === label) ?? null;
