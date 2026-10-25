import { useAnimatedNumber } from "../../hooks/useAnimatedValue";

/**
 * Counts up from 0 to `value` when it appears, then tweens on later changes.
 * `null`/`undefined` renders the placeholder instead.
 */
export default function AnimatedNumber({
  value,
  format = (n: number) => String(n),
  decimals = 0,
  delay = 0,
  ms = 900,
  placeholder = "—",
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  decimals?: number;
  delay?: number;
  ms?: number;
  placeholder?: string;
}) {
  const shown = useAnimatedNumber(value ?? 0, ms, delay);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return <>{placeholder}</>;
  const f = Math.pow(10, decimals);
  return <>{format(Math.round(shown * f) / f)}</>;
}
