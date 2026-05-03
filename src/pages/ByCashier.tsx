import { useMemo } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR } from "../lib/types";

interface DeviceStat {
  device_id: string;
  device_label: string;
  count: number;
  totalIn: number;
  totalOut: number;
  byProvider: Record<string, number>;
  lastSeen: string;
}

export default function ByCashier() {
  const period = usePeriod("today");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 5000,
  });

  const stats = useMemo<DeviceStat[]>(() => {
    const map = new Map<string, DeviceStat>();
    for (const r of data) {
      const s = map.get(r.device_id) ?? {
        device_id: r.device_id,
        device_label: r.device_label || r.device_id,
        count: 0,
        totalIn: 0,
        totalOut: 0,
        byProvider: {},
        lastSeen: r.sms_timestamp,
      };
      s.device_label = r.device_label || s.device_label;
      s.count += 1;
      if (r.amount != null) {
        if (r.type === "INCOMING") s.totalIn += r.amount;
        if (r.type === "OUTGOING") s.totalOut += r.amount;
        s.byProvider[r.provider] = (s.byProvider[r.provider] ?? 0) + r.amount;
      }
      if (r.sms_timestamp > s.lastSeen) s.lastSeen = r.sms_timestamp;
      map.set(r.device_id, s);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.totalIn + b.totalOut - (a.totalIn + a.totalOut)
    );
  }, [data]);

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Par caisse</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Activité — {period.range.label}, regroupée par téléphone
        </p>
      </header>

      <PeriodFilter
        value={period.key}
        onChange={period.setKey}
        customSince={period.customSince}
        customUntil={period.customUntil}
        onCustomSince={period.setCustomSince}
        onCustomUntil={period.setCustomUntil}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div
            key={s.device_id}
            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3"
          >
            <div>
              <div className="text-lg font-medium">{s.device_label}</div>
              <div className="text-xs text-slate-500 font-mono truncate" title={s.device_id}>
                {s.device_id}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-slate-500">Reçu</div>
                <div className="text-emerald-500 font-mono">{fmtMoney(s.totalIn)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Envoyé</div>
                <div className="text-rose-500 font-mono">{fmtMoney(s.totalOut)}</div>
              </div>
            </div>

            <div className="space-y-1">
              {Object.entries(s.byProvider)
                .sort((a, b) => b[1] - a[1])
                .map(([p, v]) => (
                  <div key={p} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER_COLOR[p] ?? "#888" }} />
                      {PROVIDER_DISPLAY[p] ?? p}
                    </span>
                    <span className="font-mono">{fmtMoney(v)}</span>
                  </div>
                ))}
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-2">
              {s.count} opération(s)
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="text-sm text-slate-500">Aucune caisse active sur cette période.</div>
        )}
      </div>
    </div>
  );
}
