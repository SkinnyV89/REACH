import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const inputClass = (error?: string) =>
  `mt-1 block w-full rounded-lg border px-3 py-2.5 text-base text-ink-900 shadow-sm outline-none transition focus:ring-2 ${
    error
      ? "border-red-500 focus:border-red-500 focus:ring-red-200"
      : "border-ink-300 focus:border-brand-500 focus:ring-brand-200"
  }`;

function Help({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
        {hint}
      </p>
    );
  return null;
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function OptionalTag() {
  return <span className="ml-1 text-sm font-normal text-ink-500">(optional)</span>;
}

export function TextArea({
  id,
  label,
  error,
  hint,
  optional,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
        {optional && <OptionalTag />}
      </label>
      <textarea
        id={id}
        name={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClass(error)}
        {...props}
      />
      <Help id={id} error={error} hint={hint} />
    </div>
  );
}

export function Select({
  id,
  label,
  error,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <select
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass(error)} bg-white`}
        {...props}
      >
        {children}
      </select>
      <Help id={id} error={error} hint={hint} />
    </div>
  );
}

// A group of checkboxes rendered as tappable cards. Large touch targets
// matter: most sellers will complete this on a phone.
export function CheckboxCards({
  name,
  legend,
  hint,
  error,
  options,
  checked,
  onToggle,
  disabledValues = [],
}: {
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string; description?: string | null }[];
  checked: string[];
  onToggle?: (value: string, next: boolean) => void;
  disabledValues?: string[];
}) {
  const id = `${name}-group`;
  return (
    <fieldset aria-describedby={describedBy(id, error, hint)}>
      <legend className="block text-sm font-medium text-ink-900">{legend}</legend>
      <Help id={id} error={undefined} hint={hint} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const isChecked = checked.includes(option.value);
          const disabled = !isChecked && disabledValues.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                isChecked ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-200"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={isChecked}
                disabled={disabled}
                onChange={(e) => onToggle?.(option.value, e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block font-medium text-ink-900">{option.label}</span>
                {option.description && <span className="block text-sm text-ink-500">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
