import { useMemo } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import ExportButton from "../components/ExportButton";
import { fmtMoney, fmtTime, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

interface ProviderStat {
  provider: string;
  in: number;
  out: number;
  count: number;
}

function computeStats(rows: AutoCapture[]): ProviderStat[] {
  const map = new Map<string, ProviderStat>();
  for (const r of rows) {
    if (r.amount == null) continue;
    const s = map.get(r.provider) ?? { provider: r.provider, in: 0, out: 0, count: 0 };
    if (r.type === "INCOMING") s.in += r.amount;
    else if (r.type === "OUTGOING") s.out += r.amount;
    s.count += 1;
    map.set(r.provider, s);
  }
  return Array.from(map.values()).sort((a, b) => b.in + b.out - (a.in + a.out));
}

export default function Today() {
  const period = usePeriod("day");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 5000,
  });
  // Toujours dispo : les 20 dernières transactions, indépendamment de la période.
  // Affichées en fallback quand la période courante est vide.
  const { data: recent } = useCaptures({
    since: null,
    until: null,
    limit: 20,
    realtime: false,
  });

  const stats = useMemo(() => computeStats(data), [data]);
  const totalIn = stats.reduce((s, p) => s + p.in, 0);
  const totalOut = stats.reduce((s, p) => s + p.out, 0);

  // Liste à afficher dans "Dernières opérations" : si la période a des données,
  // on prend les 30 premières ; sinon, on retombe sur les 20 dernières globales.
  const displayedOps = data.length > 0 ? data.slice(0, 30) : recent;
  const displayedOpsEmpty = data.length === 0 && recent.length === 0;

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{period.range.label}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mise à jour en temps réel — {data.length} transaction(s)
          </p>
        </div>
        <ExportButton
          rows={data}
          cols={[
            { key: "sms_timestamp", label: "Date", transform: (v: string) => fmtFullDate(v) },
            { key: "device_label", label: "Caisse" },
            { key: "provider", label: "Opérateur", transform: (v: string) => PROVIDER_DISPLAY[v] ?? v },
            { key: "type", label: "Type", transform: (v: string) => TYPE_DISPLAY[v] ?? v },
            { key: "amount", label: "Montant" },
            { key: "fee", label: "Frais" },
            { key: "balance", label: "Solde" },
            { key: "reference", label: "Référence" },
            { key: "counterparty", label: "Contrepartie" },
          ]}
          filenamePrefix="aujourdhui"
          pdfTitle={period.range.label}
          pdfSubtitle={`${data.length} transaction(s)`}
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

      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard title="Reçu (toutes caisses)" value={fmtMoney(totalIn)} accent="text-emerald-500" />
          <KpiCard title="Envoyé" value={fmtMoney(totalOut)} accent="text-rose-500" />
          <KpiCard title="Net" value={fmtMoney(totalIn - totalOut)} accent="text-brand-500" />
        </div>
      )}

      {stats.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Par opérateur</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div
                key={s.provider}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: PROVIDER_COLOR[s.provider] ?? "#888" }} />
                  <span className="font-medium">{PROVIDER_DISPLAY[s.provider] ?? s.provider}</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                  <div>↘ Reçu : {fmtMoney(s.in)}</div>
                  <div>↗ Envoyé : {fmtMoney(s.out)}</div>
                  <div className="text-xs text-slate-500">{s.count} opération(s)</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">
          {data.length > 0 ? "Dernières opérations" : "Dernières opérations (toutes périodes)"}
        </h2>
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          {displayedOps.map((r) => (
            <li key={r.id} className="p-3 flex items-center gap-3">
              <span className="w-2 h-10 rounded-full flex-none" style={{ background: PROVIDER_COLOR[r.provider] ?? "#888" }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-medium truncate">
                    {PROVIDER_DISPLAY[r.provider] ?? r.provider} — {TYPE_DISPLAY[r.type] ?? r.type}
                  </span>
                  <span className="text-xs text-slate-500 flex-none">{fmtTime(r.sms_timestamp)}</span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 flex justify-between gap-2">
                  <span className="truncate">{r.counterparty ?? r.reference ?? r.device_label}</span>
                  <span className={`font-mono flex-none ${
                    r.type === "INCOMING" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : "text-slate-500"
                  }`}>
                    {r.type === "OUTGOING" ? "−" : "+"}{fmtMoney(r.amount)}
                  </span>
                </div>
              </div>
            </li>
          ))}
          {displayedOpsEmpty && <li className="p-4 text-sm text-slate-500">Aucune opération.</li>}
        </ul>
      </section>
    </div>
  );
}

function KpiCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
