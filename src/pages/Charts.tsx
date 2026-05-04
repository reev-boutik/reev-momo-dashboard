import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import ExportButton from "../components/ExportButton";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR, type AutoCapture } from "../lib/types";

interface DailyPoint {
  date: string;
  ORANGE_MONEY: number;
  MTN_MOMO: number;
  MOOV_MONEY: number;
  WAVE: number;
  UNKNOWN: number;
  total: number;
}

function dailyAggregate(rows: AutoCapture[], since: string | null): DailyPoint[] {
  // Détermine la plage de jours à afficher
  const start = since ? new Date(since) : null;
  const end = new Date();
  // Si pas de since, on affiche les 14 derniers jours par défaut
  const startDate = start ?? new Date(end.getFullYear(), end.getMonth(), end.getDate() - 13);
  startDate.setHours(0, 0, 0, 0);

  const buckets = new Map<string, DailyPoint>();
  for (let d = new Date(startDate); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      ORANGE_MONEY: 0,
      MTN_MOMO: 0,
      MOOV_MONEY: 0,
      WAVE: 0,
      UNKNOWN: 0,
      total: 0,
    });
  }
  for (const r of rows) {
    const key = r.sms_timestamp.slice(0, 10);
    const b = buckets.get(key);
    if (!b || r.type !== "INCOMING" || r.amount == null) continue;
    const p = (b as any)[r.provider] ?? 0;
    (b as any)[r.provider] = p + r.amount;
    b.total += r.amount;
  }
  return Array.from(buckets.values());
}

export default function Charts() {
  const period = usePeriod("month");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 10000,
  });

  const daily = useMemo(
    () => dailyAggregate(data, period.range.since),
    [data, period.range.since]
  );

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  const formatShort = (d: string) => d.slice(5);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Graphiques</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Volume reçu — {period.range.label}
          </p>
        </div>
        <ExportButton
          rows={daily}
          cols={[
            { key: "date", label: "Date" },
            { key: "ORANGE_MONEY", label: "Orange Money" },
            { key: "MTN_MOMO", label: "MTN MoMo" },
            { key: "MOOV_MONEY", label: "Moov Money" },
            { key: "WAVE", label: "Wave" },
            { key: "UNKNOWN", label: "Inconnu" },
            { key: "total", label: "Total" },
          ]}
          filenamePrefix="graphique_volumes"
          pdfTitle="Volumes reçus par jour"
          pdfSubtitle={period.range.label}
        />
      </header>

      <PeriodFilter
        value={period.key}
        onChange={period.setKey}
        count={period.count}
        onCountChange={period.setCount}
        customSince={period.customSince}
        customUntil={period.customUntil}
        onCustomSince={period.setCustomSince}
        onCustomUntil={period.setCustomUntil}
      />

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">
          Reçu par opérateur (empilé)
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="date" tickFormatter={formatShort} fontSize={11} />
              <YAxis tickFormatter={(v) => fmtMoney(v)} fontSize={11} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Legend />
              <Bar dataKey="ORANGE_MONEY" name={PROVIDER_DISPLAY.ORANGE_MONEY} stackId="a" fill={PROVIDER_COLOR.ORANGE_MONEY} />
              <Bar dataKey="MTN_MOMO" name={PROVIDER_DISPLAY.MTN_MOMO} stackId="a" fill={PROVIDER_COLOR.MTN_MOMO} />
              <Bar dataKey="MOOV_MONEY" name={PROVIDER_DISPLAY.MOOV_MONEY} stackId="a" fill={PROVIDER_COLOR.MOOV_MONEY} />
              <Bar dataKey="WAVE" name={PROVIDER_DISPLAY.WAVE} stackId="a" fill={PROVIDER_COLOR.WAVE} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Total reçu / jour</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="date" tickFormatter={formatShort} fontSize={11} />
              <YAxis tickFormatter={(v) => fmtMoney(v)} fontSize={11} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Line type="monotone" dataKey="total" stroke="#1976D2" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
