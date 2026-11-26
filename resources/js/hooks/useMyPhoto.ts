import { useEffect, useState } from "react";
import api from "../lib/api";

/** Fired after a resident's ID photo is saved, so the signed-in user's avatar refreshes without a reload. */
export const MY_PHOTO_CHANGED = "piao:my-photo-changed";
export const notifyMyPhotoChanged = () => window.dispatchEvent(new Event(MY_PHOTO_CHANGED));

/** The signed-in user's ID photo URL (null when there is none yet). */
export default function useMyPhoto(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.get("/me");
        if (alive) setUrl(r.data?.validation_id_url || null);
      } catch { /* keep the default avatar */ }
    };
    load();
    window.addEventListener(MY_PHOTO_CHANGED, load);
    return () => { alive = false; window.removeEventListener(MY_PHOTO_CHANGED, load); };
  }, []);
  return url;
}
