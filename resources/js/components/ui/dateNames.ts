type T = (key: string) => string;

/** Localised month / weekday names (en / tl / ceb) pulled from the ui.ts dictionary. */
export const monthLong = (t: T, m: number) => t(`uiMonthLong${m + 1}`);
export const monthShort = (t: T, m: number) => t(`uiMonthShort${m + 1}`);
export const weekdayShort = (t: T, i: number) => t(`uiWeekdayShort${i}`);

/** "Oct 6, 2026" in the active language. */
export const formatShortDate = (d: Date, t: T) => `${monthShort(t, d.getMonth())} ${d.getDate()}, ${d.getFullYear()}`;
