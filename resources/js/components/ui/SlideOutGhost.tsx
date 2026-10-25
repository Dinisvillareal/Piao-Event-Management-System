import { useLayoutEffect, useRef } from "react";

const SLIDE_IN_CLASSES = ["slide-over-in", "event-form-slide-in", "resident-profile-slide-in"];
const OUT_MS = 240;

/**
 * Makes a right-hand slide-over slide back OUT when it closes, however it
 * was closed (Cancel, the dimmed backdrop, or the page unmounting it after a
 * save). React removes a closed panel from the page at once, so on unmount
 * this drops a harmless, click-through copy of the panel and its backdrop
 * where they were, slides the copy off to the right while the backdrop fades,
 * then deletes it.
 *
 * Put it as the FIRST child of the panel's fragment, directly before the
 * backdrop, which must be followed by the panel itself:
 *   <><SlideOutGhost /><div backdrop/><div panel/></>
 * React tears siblings down in order, so this runs while both are still on
 * the page.
 */
export default function SlideOutGhost() {
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    return () => {
      const m = marker.current;
      if (!m || typeof document === "undefined") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const backdrop = m.nextElementSibling as HTMLElement | null;
      const panel = backdrop?.nextElementSibling as HTMLElement | null;
      if (!backdrop || !panel) return;

      const copy = (el: HTMLElement, cls: string) => {
        const c = el.cloneNode(true) as HTMLElement;
        // A copy doesn't carry what was typed into fields -- put the text back so nothing blanks out mid-slide.
        const from = el.querySelectorAll("input, textarea, select");
        const to = c.querySelectorAll("input, textarea, select");
        from.forEach((f, i) => {
          const t = to[i] as HTMLInputElement | undefined;
          if (!t) return;
          if (f instanceof HTMLTextAreaElement) t.textContent = f.value;
          else if (f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio")) {
            if (f.checked) t.setAttribute("checked", ""); else t.removeAttribute("checked");
          } else t.setAttribute("value", (f as HTMLInputElement).value);
        });
        SLIDE_IN_CLASSES.forEach((k) => c.classList.remove(k));
        c.classList.add(cls);
        c.setAttribute("aria-hidden", "true");
        c.removeAttribute("id");
        document.body.appendChild(c);
        return c;
      };

      const ghosts = [copy(backdrop, "slide-backdrop-out"), copy(panel, "slide-over-out")];
      window.setTimeout(() => ghosts.forEach((g) => g.remove()), OUT_MS + 40);
    };
  }, []);

  return <span ref={marker} hidden data-slide-ghost="" />;
}
