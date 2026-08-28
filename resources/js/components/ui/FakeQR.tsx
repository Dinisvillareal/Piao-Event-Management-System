import { useMemo } from "react";

interface FakeQRProps {
  seed: string;
}

export default function FakeQR({ seed }: FakeQRProps) {
  const cells = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return Array.from({ length: 225 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >>> 16) % 2 === 0;
    });
  }, [seed]);

  return (
    <div
      className="grid h-40 w-40 gap-[1.5px] rounded-xl bg-white"
      style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          className={on ? "bg-[#095a5a] rounded-[1px]" : "bg-white"}
        />
      ))}
    </div>
  );
}