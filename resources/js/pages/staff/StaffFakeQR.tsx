import React, { useMemo } from "react";

export default function StaffFakeQR({ seed, large }: { seed: string; large?: boolean }) {
  const cells = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 169 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 16) % 2 === 0;
    });
  }, [seed]);

  return (
    <div
      className={`grid gap-[2px] rounded-xl bg-white p-2 shadow ring-1 ring-gray-200 ${
        large ? "h-44 w-44" : "h-32 w-32"
      }`}
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
    >
      {cells.map((on, i) => (
        <div key={i} className={on ? "bg-[#095a5a]" : "bg-white"} />
      ))}
    </div>
  );
}