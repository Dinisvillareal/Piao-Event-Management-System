import type { LucideIcon } from "lucide-react";
import AnimatedNumber from "./AnimatedNumber";

/**
 * The one stat tile used at the top of every page -- the same look as the
 * Reports & Analytics summary cards (big rounded gradient, icon, count-up
 * number, uppercase label). Put the tiles in a grid that has the
 * `report-stagger` class so they rise in one after another, exactly like
 * Reports. A number counts up from 0; a string (e.g. "5 min ago") shows as is.
 */
export default function KpiCard({
  value,
  label,
  description,
  icon: Icon,
  gradient: _gradient, // kept so existing pages still compile; every stat card now shares the one sage colour
  onClick,
  delay = 0,
  format,
  decimals = 0,
  plain = true,
  className = "",
}: {
  value: number | string | null | undefined;
  label: string;
  description?: string;
  icon?: LucideIcon;
  gradient: string;
  onClick?: () => void;
  delay?: number;
  format?: (n: number) => string;
  decimals?: number;
  /** White card in light mode / dark card in dark mode instead of the sage gradient (used on the Dashboard). */
  plain?: boolean;
  className?: string;
}) {
  const isNumber = typeof value === "number";
  const fmt = format ?? ((n: number) => n.toLocaleString("en-US", { maximumFractionDigits: decimals }));
  const finalText = isNumber ? fmt(value as number) : String(value ?? "—");
  const size = !isNumber ? "text-lg sm:text-xl lg:text-2xl" : finalText.length > 9 ? "text-xl sm:text-2xl xl:text-[1.7rem]" : "text-2xl sm:text-3xl";
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { onClick, type: "button" } : {})}
      className={`relative w-full overflow-hidden rounded-[24px] ${plain ? "dash-card !shadow-[0_14px_34px_rgba(15,23,42,0.18)] print:!shadow-none" : "bg-gradient-to-r from-sage-400 to-sage-700 shadow-sm"} max-sm:col-span-full flex items-center gap-3.5 p-4 text-left sm:block sm:rounded-[30px] sm:p-5 text-white transition-all duration-200 ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""
      } ${className}`}
    >
      {Icon && (
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl max-sm:border ${plain ? "bg-[#2E8E82]/12 max-sm:border-[#2E8E82]/25" : "bg-white/15 max-sm:border-white/20"} sm:h-auto sm:w-auto sm:rounded-none sm:bg-transparent`}>
          <Icon className={`h-5 w-5 ${plain ? "text-[#2E8E82]" : "opacity-80"}`} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className={`whitespace-nowrap font-black tracking-tight [font-variant-numeric:tabular-nums] sm:mt-2 ${size}`}>
          {isNumber ? <AnimatedNumber value={value as number} format={fmt} decimals={decimals} delay={delay} /> : finalText}
        </h2>
        <p className="mt-0.5 text-[11px] font-semibold uppercase leading-tight tracking-wide sm:mt-1 sm:text-xs">{label}</p>
        {description && <p className={`mt-0.5 text-xs leading-snug ${plain ? "text-white/55" : "text-white/75"} sm:mt-1.5`}>{description}</p>}
      </div>
    </Tag>
  );
}
