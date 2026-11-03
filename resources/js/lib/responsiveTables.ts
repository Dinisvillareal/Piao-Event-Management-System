// Phone layout for data tables: any <table class="rtable"> turns into a stack of
// cards below 768px (see the .rtable rules in app.css). The cards label each
// value with its column heading, so this copies every header's text onto the
// cells under it as data-label. It runs for tables that render later too.
function label(table: HTMLTableElement) {
  const heads = Array.from(table.querySelectorAll<HTMLElement>(":scope > thead th")).map((th) => (th.textContent || "").trim());
  if (heads.length === 0) return;
  table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr").forEach((tr) => {
    let col = 0;
    Array.from(tr.children).forEach((cell) => {
      const td = cell as HTMLTableCellElement;
      const span = td.colSpan || 1;
      const text = span > 1 ? "" : heads[col] ?? "";
      if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
      col += span;
    });
  });
}

let queued = false;
function run() {
  queued = false;
  document.querySelectorAll<HTMLTableElement>("table.rtable").forEach(label);
}

export function startResponsiveTables() {
  if (typeof window === "undefined" || (window as any).__rtables) return;
  (window as any).__rtables = true;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
