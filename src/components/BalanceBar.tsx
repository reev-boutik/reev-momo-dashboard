import { useMemo } from "react";
import { useLatestBalances } from "../hooks/useLatestBalances";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR } from "../lib/types";

/**
 * Barre des soldes affichée en haut. Indépendante de la période.
 *
 * Le total est la somme des soldes les plus récents par (caisse, opérateur,
 * catégorie). Les comptes Money et Cabine d'un même opérateur sont distincts
 * — ils représentent des portefeuilles différents (compte principal vs.
 * compte de revente d'airtime). Idem pour Wave Normal vs Wave Marchand.
 */
export default function BalanceBar() {
  const { data, loading } = useLatestBalances();

  // Agrège par (provider, category) — somme des soldes de toutes les caisses
  // pour cette combinaison. Une boutique avec 3 caisses Wave Marchand
  // partagées (même compte) verrait sa balance comptée 3 fois ; ici chaque
  // caisse a en pratique son propre compte donc la somme est la bonne.
  const byAccount = useMemo(() => {
    const map = new Map<string, { provider: string; category: string; sum: number }>();
    for (const b of data) {
      const key = `${b.provider}|${b.category}`;
      const cur = map.get(key);
      if (cur) {
        cur.sum += b.balance;
      } else {
        map.set(key, { provider: b.provider, category: b.category, sum: b.balance });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sum - a.sum);
  }, [data]);

  const total = useMemo(() => data.reduce((s, b) => s + b.balance, 0), [data]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-500 text-white p-4">
        <div className="text-xs uppercase tracking-wider opacity-70">Solde total (toutes caisses, tous comptes)</div>
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
            Solde total (toutes caisses, tous comptes)
          </div>
          <div className="text-3xl font-mono font-bold mt-1">{fmtMoney(total)}</div>
        </div>
        <div className="text-xs opacity-75">
          {data.length} compte(s) suivi(s)
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {byAccount.map((acc) => (
          <div
            key={`${acc.provider}|${acc.category}`}
            className="rounded-full bg-white/20 px-3 py-1 text-sm flex items-center gap-2"
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: PROVIDER_COLOR[acc.provider] ?? "#fff" }}
            />
            <span className="font-medium">{accountLabel(acc.provider, acc.category)}:</span>
            <span className="font-mono">{fmtMoney(acc.sum)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Combine provider + category en libellé court pour les chips.
 * Doit rester aligné avec MainActivity.accountLabel() côté Android.
 */
function accountLabel(provider: string, category: string): string {
  const baseLabel = PROVIDER_DISPLAY[provider] ?? provider;
  if (category === "CABINE") {
    const short =
      provider === "ORANGE_MONEY" ? "Orange" :
      provider === "MOOV_MONEY"   ? "Moov" :
      provider === "MTN_MOMO"     ? "MTN" :
      baseLabel;
    return `${short} Cabine`;
  }
  if (category === "WAVE_MARCHAND") return "Wave Marchand";
  if (category === "WAVE_NORMAL") return "Wave";
  return baseLabel;
}
