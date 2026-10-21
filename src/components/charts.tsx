// Small, dependency-free chart pieces (server components, plain HTML/CSS).
// Specs follow the dataviz guidance: bars <=24px thick, 4px rounded data
// end and square baseline, one hue for magnitude (gray only to de-emphasise),
// values at the bar tip in text colours, hover/focus details, and the same
// numbers always available in a table next to the chart.

export const CHART_COLORS = {
  accent: "#0d8a6c", // brand-600; validated vs white (contrast >= 3:1)
  muted: "#6b7280", // ink-500; de-emphasis for "Unknown"
} as const;

export type BarRow = {
  key: string;
  label: string;
  value: number;
  // Shown on hover/focus; the same facts are also in the table view.
  detail?: string;
  muted?: boolean;
};

export function HBarChart({ rows, valueLabel, max }: { rows: BarRow[]; valueLabel: string; max?: number }) {
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3" role="list">
      {rows.map((row) => {
        const pct = (row.value / top) * 100;
        const description = `${row.label}: ${row.value} ${valueLabel}${row.detail ? `. ${row.detail}` : ""}`;
        return (
          <li key={row.key}>
            {/* The whole row is the hover/focus target, bigger than the bar. */}
            <div
              tabIndex={0}
              aria-label={description}
              className="group relative grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-200 sm:grid-cols-[8rem_1fr]"
            >
              <span className="truncate text-sm text-ink-700">{row.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                {row.value > 0 ? (
                  <span
                    aria-hidden
                    className="h-5 rounded-r"
                    style={{
                      width: `max(${pct}%, 4px)`,
                      maxWidth: "calc(100% - 3.5rem)",
                      backgroundColor: row.muted ? CHART_COLORS.muted : CHART_COLORS.accent,
                    }}
                  />
                ) : (
                  <span aria-hidden className="h-5 w-px bg-ink-300" />
                )}
                <span aria-hidden className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                  {row.value.toLocaleString("en-ZA")}
                </span>
              </span>
              {row.detail && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-max max-w-[16rem] rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block"
                >
                  <span className="font-semibold">{row.label}</span>
                  <br />
                  {row.detail}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-ink-300/60 bg-white p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink-900">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-500">{note}</p>}
    </div>
  );
}
