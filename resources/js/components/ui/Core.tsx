import React, { useMemo } from "react";

export function Card({ children, className = "" }: any) { return <div className={`bg-white rounded-lg border shadow-sm ${className}`}>{children}</div>; }
export function CardHeader({ children, className = "" }: any) { return <div className={`p-4 border-b ${className}`}>{children}</div>; }
export function CardTitle({ children, className = "" }: any) { return <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>; }
export function CardDescription({ children, className = "" }: any) { return <p className={`text-sm text-gray-500 ${className}`}>{children}</p>; }
export function CardContent({ children, className = "" }: any) { return <div className={`p-4 ${className}`}>{children}</div>; }

export function Button({ children, variant = "default", size = "default", className = "", ...props }: any) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors";
  const variants: any = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-300 bg-white hover:bg-gray-100",
    ghost: "hover:bg-gray-100"
  };
  const sizes: any = {
    default: "px-4 py-2 text-sm",
    sm: "px-2 py-1 text-xs",
    icon: "h-9 w-9 p-0"
  };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>{children}</button>;
}

export function Input({ className = "", ...props }: any) { return <input className={`w-full px-3 py-2 border rounded-md ${className}`} {...props} />; }
export function Label({ children, className = "" }: any) { return <label className={`text-sm font-medium ${className}`}>{children}</label>; }

export function Badge({ children, variant = "default", className = "" }: any) {
  const variants: any = { default: "bg-teal-50 text-teal-800", secondary: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>{children}</span>;
}

export function Select({ value, onValueChange, children, className = "" }: any) {
  return (
    <select value={value} onChange={(e) => onValueChange(e.target.value)} className={`w-full px-3 py-2 border rounded-md ${className}`}>
      {children}
    </select>
  );
}
export function SelectItem({ value, children, className = "" }: any) { return <option value={value} className={className}>{children}</option>; }

export function FakeQR({ seed, large }: { seed: string; large?: boolean }) {
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
      className={`grid gap-[2px] rounded-xl bg-white p-2 shadow ring-1 ring-gray-200 ${large ? "h-44 w-44" : "h-32 w-32"}`}
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
    >
      {cells.map((on, i) => <div key={i} className={on ? "bg-[#095a5a]" : "bg-white"} />)}
    </div>
  );
}