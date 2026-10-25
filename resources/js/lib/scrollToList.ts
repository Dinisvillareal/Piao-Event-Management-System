/**
 * After a page change on a phone/tablet the pager sits at the bottom of the
 * screen, so the new rows would load out of sight. This brings the top of the
 * list back into view -- a no-op when it's already on screen (a laptop).
 *
 * It finds whichever ancestor actually scrolls (the app's content pane, the
 * member page container, or the window) and scrolls that one directly,
 * waiting for React to commit the new page first so the layout swap can't
 * cancel or undo it.
 */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null; // the window itself scrolls
}

export function scrollListIntoView(el: HTMLElement | null) {
  if (!el || typeof window === "undefined") return;
  const run = () => {
    const parent = scrollParentOf(el);
    const parentTop = parent ? parent.getBoundingClientRect().top : 0;
    const delta = el.getBoundingClientRect().top - parentTop - 12;
    if (delta >= 0) return; // list top is already visible
    if (parent) parent.scrollTo({ top: parent.scrollTop + delta, behavior: "auto" });
    else window.scrollTo({ top: window.scrollY + delta, behavior: "auto" });
  };
  // Two frames: lets the state update + skeleton swap render first.
  requestAnimationFrame(() => requestAnimationFrame(run));
}
