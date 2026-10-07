import React from "react";
import FilterDropdown from "./FilterDropdown";

/**
 * Drop-in replacement for a native <select> in dark form fields. Accepts the
 * same <option> children and an event-style onChange, but renders the app's
 * own dropdown (same look as the filter dropdowns) instead of the browser's
 * unstyleable native list.
 *
 * A first option with value="" that is hidden/disabled (or display:none) is
 * treated as the placeholder text, not as a selectable choice.
 */
interface FormSelectProps {
  value?: string | number | null;
  onChange?: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  [key: string]: any;
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as any).children);
  return "";
}

export default function FormSelect({ value, onChange, children, className = "", disabled, searchable }: FormSelectProps) {
  const options: { value: string; label: string; disabled?: boolean; hint?: string }[] = [];
  let placeholder: string | undefined;

  React.Children.toArray(children).forEach((child) => {
    if (!React.isValidElement(child)) return;
    const props: any = child.props;
    const v = props.value === undefined ? textOf(props.children) : String(props.value);
    const label = textOf(props.children);
    const isPlaceholder = v === "" && (props.hidden || props.disabled || props.style?.display === "none");
    if (isPlaceholder) {
      placeholder = label;
      return;
    }
    options.push({ value: v, label, disabled: !!props.disabled, hint: props["data-hint"] });
  });

  const hasError = className.includes("border-red-500");
  const current = value === null || value === undefined ? "" : String(value);

  return (
    <FilterDropdown
      value={current}
      onChange={(v) => onChange?.({ target: { value: v } })}
      options={options}
      placeholder={placeholder ?? (options.some((o) => o.value === current) ? undefined : "")}
      fullWidth
      dark
      disabled={disabled}
      searchable={searchable ?? options.length > 8}
      wrapperClassName="w-full"
      className={`w-full h-[54px] px-5 !text-base font-sans !bg-white/10 ${hasError ? "!border-red-500" : "!border-white/25"} focus:!border-[#4FBEB0]/70 focus:ring-[#4FBEB0]/40 ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    />
  );
}
