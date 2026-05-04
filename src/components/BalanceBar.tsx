import { useMemo } from "react";
import { useLatestBalances } from "../hooks/useLatestBalances";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR } from "../lib/types";

/**
 * Barre des soldes affichée en haut. Indépendante de la période.
 *
 * Le total est la somme des soldes les plus récents par (caisse, opérateur).
 * Si une caisse a 3 opérateurs (Orange + MTN + Wave), chaque solde compte une fois.
 */
export default function BalanceBar() {
  const { data, loading } = useLatestBalances();

  // Agrège par opérateur (somme des soldes de toutes les caisses pour cet opérateur)
  const byProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of data) {
      map.set(b.provider, (map.get(b.provider) ?? 0) + b.balance);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [data]);

  const total = useMemo(() => data.reduce((s, b) => s + b.balance, 0), [data]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-500 text-white p-4">
        <div className="text-xs uppercase tracking-wider opacity-70">Solde total (toutes caisses, tous réseaux)</div>
        <div className="text-2xl font-mono mt-1">…</div>
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-4 shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-80">
            Solde total (toutes caisses, tous réseaux)
          </div>
          <div className="text-3xl font-mono font-bold mt-1">{fmtMoney(total)} F</div>
        </div>
        <div className="text-xs opacity-75">
          {data.length} compte(s) suivi(s)
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {byProvider.map(([provider, sum]) => (
          <div
            key={provider}
            className="rounded-full bg-white/20 px-3 py-1 text-sm flex items-center gap-2"
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: PROVIDER_COLOR[provider] ?? "#fff" }}
            />
            <span className="font-medium">{PROVIDER_DISPLAY[provider] ?? provider}:</span>
            <span className="font-mono">{fmtMoney(sum)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
