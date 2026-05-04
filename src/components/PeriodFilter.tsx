import type { PeriodKey } from "../hooks/usePeriod";

interface Props {
  value: PeriodKey;
  count: number;
  onChange: (k: PeriodKey) => void;
  onCountChange: (n: number) => void;
  customSince?: string;
  customUntil?: string;
  onCustomSince?: (v: string) => void;
  onCustomUntil?: (v: string) => void;
}

const PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
  { key: "year", label: "Année" },
  { key: "all", label: "Tout" },
  { key: "custom", label: "Perso" },
];

const COUNT_OPTIONS: Record<string, number[]> = {
  day:   [1, 3, 7, 10, 14, 30, 60, 90],
  week:  [1, 2, 4, 8, 12, 26, 52],
  month: [1, 3, 6, 12, 24, 36],
  year:  [1, 2, 3, 5, 10],
};

export default function PeriodFilter({
  value,
  count,
  onChange,
  onCountChange,
  customSince,
  customUntil,
  onCustomSince,
  onCustomUntil,
}: Props) {
  const showCount = value === "day" || value === "week" || value === "month" || value === "year";
  const options = showCount ? COUNT_OPTIONS[value as string] : [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition ${
              value === p.key
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showCount && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">N derniers :</span>
          <select
            value={count}
            onChange={(e) => onCountChange(parseInt(e.target.value, 10))}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
          >
            {options.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {value === "custom" && (
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Du</span>
            <input
              type="date"
              value={customSince ? customSince.slice(0, 10) : ""}
              onChange={(e) => {
                if (!onCustomSince) return;
                onCustomSince(
                  e.target.value
                    ? new Date(e.target.value + "T00:00:00").toISOString()
                    : ""
                );
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Au</span>
            <input
              type="date"
              value={customUntil ? customUntil.slice(0, 10) : ""}
              onChange={(e) => {
                if (!onCustomUntil) return;
                onCustomUntil(
                  e.target.value
                    ? new Date(e.target.value + "T23:59:59").toISOString()
                    : ""
                );
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
            />
          </label>
        </div>
      )}
    </div>
  );
}
