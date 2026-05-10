import { useMemo } from "react";
import { useLatestBalances } from "../hooks/useLatestBalances";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR } from "../lib/types";

/**
 * Barre des soldes affichée en haut. Indépendante de la période.
 *
 * Affiche UN chip par (provider, category) avec le dernier solde connu
 * (peu importe le device source). Le total est la somme de ces uniques
 * balances — on ne cumule pas plusieurs devices pour un même compte.
 *
 * Cf. useLatestBalances pour la logique de sélection (le hook retourne
 * déjà 1 row par (provider, category), pas besoin d'agréger ici).
 */
export default function BalanceBar() {
  const { data, loading } = useLatestBalances();

  // data est déjà 1 row par (provider, category). On trie juste par balance
  // décroissante pour mettre les plus gros comptes en premier.
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.balance - a.balance),
    [data]
  );

  // Le total = somme des balances individuelles (chacune est UN compte
  // unique). Une transaction Wave Marchand ≠ une transaction Wave personal,
  // donc on les compte séparément.
  const total = useMemo(() => data.reduce((s, b) => s + b.balance, 0), [data]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-500 text-white p-4">
        <div className="text-xs uppercase tracking-wider opacity-70">Solde total (tous comptes)</div>
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
            Solde total (tous comptes)
          </div>
          <div className="text-3xl font-mono font-bold mt-1">{fmtMoney(total)}</div>
        </div>
        <div className="text-xs opacity-75">
          {data.length} compte(s) suivi(s)
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {sorted.map((b) => (
          <div
            key={`${b.provider}|${b.category}`}
            className="rounded-full bg-white/20 px-3 py-1 text-sm flex items-center gap-2"
            title={`Dernier rapport : ${b.device_label} le ${new Date(b.sms_timestamp).toLocaleString("fr-FR")}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: PROVIDER_COLOR[b.provider] ?? "#fff" }}
            />
            <span className="font-medium">{accountLabel(b.provider, b.category)}:</span>
            <span className="font-mono">{fmtMoney(b.balance)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Combine provider + category en libellé court pour les chips.
 * Doit rester aligné avec MainActivity.accountLabel() côté Android.
 *
 * Cas spéciaux pour éviter les collisions de label :
 *  - Wave + WAVE_NORMAL → "Wave"  (cas standard Wave personnel)
 *  - Wave + MONEY (legacy)        → "Wave (legacy)"   (avant reparseAll)
 *  - Wave + autre catégorie       → "Wave (X)"        (filet de sécurité)
 *
 * Sans ces fallbacks, deux Wave avec catégories différentes (ex. WAVE_NORMAL
 * et MONEY) afficheraient tous les deux "Wave" et seraient indistinguables.
 */
function accountLabel(provider: string, category: string): string {
  const baseLabel = PROVIDER_DISPLAY[provider] ?? provider;
  const short =
    provider === "ORANGE_MONEY" ? "Orange" :
    provider === "MOOV_MONEY"   ? "Moov" :
    provider === "MTN_MOMO"     ? "MTN" :
    baseLabel;

  if (category === "CABINE") return `${short} Cabine`;
  if (category === "PAY") return `${short} Pay`;
  if (category === "WAVE_MARCHAND") return "Wave Marchand";
  if (category === "WAVE_NORMAL") return "Wave";

  // Fallback : (provider, MONEY) ou catégorie inconnue
  if (provider === "WAVE" && category !== "WAVE_NORMAL") {
    // Wave avec une catégorie qui n'est pas WAVE_NORMAL = legacy
    // (avant que detectCategory ne soit déployé). Suffixe pour
    // distinguer du chip "Wave" standard.
    return category === "MONEY" ? "Wave (legacy)" : `Wave (${category.toLowerCase()})`;
  }
  // (* | MONEY) → display name standard du provider
  return baseLabel;
}
