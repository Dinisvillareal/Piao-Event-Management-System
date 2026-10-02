import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface NumberStepperProps {
  /** Kept as a string, like a normal controlled <input>, so this works for
      both integer quantities and free-typed decimal amounts without this
      component owning any parsing opinions beyond its own +/- buttons. */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Classes for the input itself -- sizing, colors, border, focus ring.
      This component adds the padding needed to clear its own buttons. */
  className?: string;
  /** True makes the whole control (input + buttons) stretch to fill its
      parent's width -- pass this, and put `w-full` on `className` too,
      wherever the field used to be a plain `w-full` input in a form
      layout. Leave false (the default) for a fixed-width field like a
      small quantity box, so the wrapper hugs the input instead of the
      buttons drifting away from it. */
  fullWidth?: boolean;
}

/**
 * A number input with its own up/down buttons, instead of the browser's
 * native <input type="number"> spinner. The native one turned out not to
 * be worth it: its arrow color follows `color-scheme`, which some browsers
 * resolve against the OS's own light/dark setting rather than the page's
 * theme, and there's no reliable, cross-browser way to give it a specific
 * dark-with-visible-arrows look (Firefox doesn't support styling it via
 * `::-webkit-inner-spin-button` at all). Building the two buttons ourselves
 * means their color is just an ordinary Tailwind class, consistent for
 * every visitor regardless of OS or browser.
 *
 * The underlying element is still a real <input type="number"> (so
 * required/min/max/step and native keyboard Up/Down-arrow stepping all
 * keep working); only its native spin buttons are hidden.
 */
export default function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  required = false,
  placeholder,
  className = "",
  fullWidth = false,
}: NumberStepperProps) {
  const current = Number.isFinite(parseFloat(value)) ? parseFloat(value) : min ?? 0;
  const atMin = min !== undefined && current <= min;
  const atMax = max !== undefined && current >= max;
  // How many digits after the decimal point `step` implies -- 0.01 means 2,
  // a plain 1 means none at all. Both the +/- buttons and typed input are
  // held to this, so a money field (step 0.01) can't end up with a third
  // decimal digit from either source.
  const decimals = (String(step).split(".")[1] || "").length;

  const bump = (delta: number) => {
    let next = current + delta;
    // Round to the step's own precision so repeated 0.01 bumps don't drift
    // into floating-point noise like 0.1 + 0.2.
    next = Number(next.toFixed(decimals));
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(String(next));
  };

  const handleTyped = (raw: string) => {
    // Reject the keystroke outright (don't call onChange) rather than
    // silently truncating after the fact -- for a controlled input, not
    // updating `value` means React just redraws the field back to what it
    // was before that keystroke, so the extra digit never visibly sticks.
    if (decimals === 0) {
      if (raw.includes(".")) return;
    } else {
      const dot = raw.indexOf(".");
      if (dot !== -1 && raw.length - dot - 1 > decimals) return;
    }
    onChange(raw);
  };

  return (
    <div className={`relative ${fullWidth ? "flex w-full" : "inline-flex"}`}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleTyped(e.target.value)}
        className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || atMax}
          onClick={() => bump(step)}
          className="flex h-3 w-4 items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:hover:text-white/50 transition"
        >
          <ChevronUp className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || atMin}
          onClick={() => bump(-step)}
          className="flex h-3 w-4 items-center justify-center text-white/50 hover:text-white disabled:opacity-30 disabled:hover:text-white/50 transition"
        >
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}
