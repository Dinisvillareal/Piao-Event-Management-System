import { useState } from "react";

// 12-hour / 24-hour display for the dashboard clock chip. Remembered on this
// device only; every read/write is guarded because storage can be unavailable.
const KEY = "clockHour12";

export function useClockFormat(): [boolean, () => void] {
  const [hour12, setHour12] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== "false";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setHour12((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        /* storage unavailable -- keep it for this visit only */
      }
      return next;
    });
  return [hour12, toggle];
}
