import { useMemo, useState } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import { fmtMoney, fmtTime, fmtDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

interface ChainedRow extends AutoCapture {
  prevBalance: number | null;
  expectedBalance: number | null;
  delta: number | null;
}

function buildChain(rows: AutoCapture[]): ChainedRow[] {
  const sorted = [...rows].sort((a, b) =>
    a.sms_timestamp.localeCompare(b.sms_timestamp)
  );
  const out: ChainedRow[] = [];
  const lastBalance = new Map<string, number | null>();

  for (const r of sorted) {
    const key = `${r.device_id}|${r.provider}`;
    const prev = lastBalance.has(key) ? lastBalance.get(key)! : null;

    let signed: number | null = null;
    if (r.amount != null) {
      if (r.type === "INCOMING" || r.type === "BONUS") signed = r.amount;
      else if (r.type === "OUTGOING") signed = -r.amount;
    }
    const fee = r.fee ?? 0;
    const expected = prev != null && signed != null ? prev + signed - fee : null;
    const delta = expected != null && r.balance != null ? expected - r.balance : null;

    out.push({ ...r, prevBalance: prev, expectedBalance: expected, delta });

    if (r.balance != null) lastBalance.set(key, r.balance);
  }
  return out.reverse();
}

export default function Reconciliation() {
  const period = usePeriod("today");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 5000,
  });
  const [device, setDevice] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [onlyDelta, setOnlyDelta] = useState<boolean>(false);

  const devices = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data) set.set(r.device_id, r.device_label || r.device_id);
    return Array.from(set.entries());
  }, [data]);

  const chained = useMemo(() => buildChain(data), [data]);

  const filtered = useMemo(
    () =>
      chained.filter((r) => {
        if (device && r.device_id !== device) return false;
        if (provider && r.provider !== provider) return false;
        if (onlyDelta && (r.delta == null || Math.abs(r.delta) < 0.5)) return false;
        return true;
      }),
    [chained, device, provider, onlyDelta]
  );

  const totalDelta = filtered.reduce((s, r) => (r.delta != null ? s + r.delta : s), 0);
  const countWithDelta = filtered.filter(
    (r) => r.delta != null && Math.abs(r.delta) >= 0.5
  ).length;

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Réconciliation</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Chaînage des soldes — {period.range.label}.
          Écart = solde calculé (précédent + montant − frais) − solde réel SMS.
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select value={device} onChange={(e) => setDevice(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
          <option value="">Toutes caisses</option>
          {devices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
          <option value="">Tous opérateurs</option>
          {Object.entries(PROVIDER_DISPLAY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={onlyDelta} onChange={(e) => setOnlyDelta(e.target.checked)} />
          Uniquement les écarts
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Lignes affichées" value={filtered.length.toString()} accent="text-slate-700 dark:text-slate-200" />
        <KpiCard title="Avec écart" value={countWithDelta.toString()}
          accent={countWithDelta > 0 ? "text-amber-500" : "text-emerald-500"} />
        <KpiCard title="Somme des écarts" value={fmtMoney(totalDelta)}
          accent={Math.abs(totalDelta) < 0.5 ? "text-emerald-500" : totalDelta > 0 ? "text-amber-500" : "text-rose-500"} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Caisse</th>
              <th className="px-3 py-2">Opérateur</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2 text-right">Frais</th>
              <th className="px-3 py-2 text-right">Solde précédent</th>
              <th className="px-3 py-2 text-right">Solde calculé</th>
              <th className="px-3 py-2 text-right">Solde réel</th>
              <th className="px-3 py-2 text-right">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {filtered.slice(0, 500).map((r) => {
              const hasDelta = r.delta != null && Math.abs(r.delta) >= 0.5;
              return (
                <tr key={r.id} className={hasDelta ? "bg-rose-50 dark:bg-rose-900/20" : ""}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {fmtDate(r.sms_timestamp)} {fmtTime(r.sms_timestamp)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.device_label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_COLOR[r.provider] ?? "#888" }} />
                      {PROVIDER_DISPLAY[r.provider] ?? r.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{TYPE_DISPLAY[r.type] ?? r.type}</td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    r.type === "INCOMING" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : ""
                  }`}>
                    {r.amount != null ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {r.fee && r.fee > 0 ? `−${fmtMoney(r.fee)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtMoney(r.prevBalance)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtMoney(r.expectedBalance)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtMoney(r.balance)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    hasDelta ? (r.delta! > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-rose-600 dark:text-rose-400 font-semibold") : "text-slate-400"
                  }`}>
                    {r.delta != null ? `${r.delta > 0 ? "+" : ""}${fmtMoney(r.delta)}` : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-4 text-center text-slate-500">Aucune ligne.</td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-slate-500 text-center">500 premières lignes affichées.</div>
        )}
      </div>
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
