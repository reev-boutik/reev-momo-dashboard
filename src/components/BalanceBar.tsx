import { useMemo, useState } from "react";
import { useLatestBalances, ProviderBalance } from "../hooks/useLatestBalances";
import { useCalculatedBalances, CalculatedBalance } from "../hooks/useCalculatedBalances";
import { fmtMoney } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR } from "../lib/types";
import CalibrateBalanceDialog from "./CalibrateBalanceDialog";

/**
 * Représentation unifiée d'un solde de compte, qu'il vienne des notifs
 * automatiques ou d'une ancre manuelle.
 */
interface AccountBalance {
  provider: string;
  category: string;
  balance: number;
  source: "auto" | "calculated";
  // Métadonnées contextuelles
  device_label?: string;
  sms_timestamp?: string;            // pour les soldes auto (notif extraite)
  anchor_at?: string;                // pour les soldes calculés
  n_transactions_since_anchor?: number;
}

/**
 * Barre des soldes affichée en haut du dashboard.
 *
 * Pour chaque compte (provider, category), affiche le solde le plus
 * pertinent selon cette priorité :
 *
 *  1. **Solde calculé** (anchor + delta) si une ancre existe dans
 *     `balance_anchors`. Indique « (calc) » et bouton ✏️ pour recalibrer.
 *  2. **Solde auto** extrait des notifs (comportement existant) sinon.
 *
 * Tous les chips ont un bouton ✏️ pour ouvrir le dialog de calibration
 * — même les comptes en mode auto, pour permettre de switcher sur
 * calculé si l'utilisateur le souhaite (ou pour corriger une dérive).
 *
 * Le total banner additionne tous les soldes uniques (un compte = un
 * solde, peu importe la source).
 */
export default function BalanceBar() {
  const { data: autoBalances, loading: loadingAuto } = useLatestBalances();
  const {
    byKey: calculated,
    loading: loadingCalc,
    refresh: refreshCalculated,
  } = useCalculatedBalances();

  const [calibrating, setCalibrating] = useState<AccountBalance | null>(null);

  // Fusionne les deux sources : pour chaque compte, on prend `calculated`
  // si disponible, sinon `auto`. On veut un chip par compte unique.
  const merged = useMemo<AccountBalance[]>(() => {
    const byKey = new Map<string, AccountBalance>();

    // 1. D'abord les soldes auto (base) — peuvent être surchargés ensuite
    for (const b of autoBalances) {
      const key = `${b.provider}|${b.category}`;
      byKey.set(key, {
        provider: b.provider,
        category: b.category,
        balance: b.balance,
        source: "auto",
        device_label: b.device_label,
        sms_timestamp: b.sms_timestamp,
      });
    }

    // 2. Ensuite les soldes calculés — overrident les auto pour la même clé
    for (const [key, c] of calculated.entries()) {
      byKey.set(key, {
        provider: c.provider,
        category: c.category,
        balance: c.calculated_balance,
        source: "calculated",
        anchor_at: c.anchor_at,
        n_transactions_since_anchor: c.n_transactions_since_anchor,
      });
    }

    return Array.from(byKey.values()).sort((a, b) => b.balance - a.balance);
  }, [autoBalances, calculated]);

  const total = useMemo(() => merged.reduce((s, b) => s + b.balance, 0), [merged]);
  const loading = loadingAuto || loadingCalc;

  if (loading) {
    return (
      <div className="rounded-2xl bg-brand-500 text-white p-4">
        <div className="text-xs uppercase tracking-wider opacity-70">Solde total (tous comptes)</div>
        <div className="text-2xl font-mono mt-1">…</div>
      </div>
    );
  }

  if (merged.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-4 shadow">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider opacity-80">
              Solde total (tous comptes)
            </div>
            <div className="text-3xl font-mono font-bold mt-1">{fmtMoney(total)}</div>
          </div>
          <div className="text-xs opacity-75">{merged.length} compte(s) suivi(s)</div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {merged.map((b) => (
            <div
              key={`${b.provider}|${b.category}`}
              className="rounded-full bg-white/20 px-3 py-1 text-sm flex items-center gap-2 group"
              title={tooltipFor(b)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: PROVIDER_COLOR[b.provider] ?? "#fff" }}
              />
              <span className="font-medium">{accountLabel(b.provider, b.category)}:</span>
              <span className="font-mono">{fmtMoney(b.balance)}</span>
              {b.source === "calculated" && (
                <span
                  className="text-[10px] opacity-80 italic"
                  title="Calculé depuis dernière calibration"
                >
                  calc
                </span>
              )}
              <button
                type="button"
                onClick={() => setCalibrating(b)}
                className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                title="Calibrer ce solde manuellement"
                aria-label={`Calibrer ${accountLabel(b.provider, b.category)}`}
              >
                ✏️
              </button>
            </div>
          ))}
        </div>
      </div>

      {calibrating && (
        <CalibrateBalanceDialog
          provider={calibrating.provider}
          category={calibrating.category}
          accountLabel={accountLabel(calibrating.provider, calibrating.category)}
          currentBalance={calibrating.balance}
          currentSource={calibrating.source}
          onSuccess={() => {
            refreshCalculated();
          }}
          onClose={() => setCalibrating(null)}
        />
      )}
    </>
  );
}

function tooltipFor(b: AccountBalance): string {
  if (b.source === "calculated" && b.anchor_at) {
    const since = b.n_transactions_since_anchor ?? 0;
    return (
      `Calibré le ${new Date(b.anchor_at).toLocaleString("fr-FR")}.\n` +
      `${since} transaction(s) depuis. Clique ✏️ pour recalibrer.`
    );
  }
  if (b.sms_timestamp) {
    return `Dernier rapport : ${b.device_label ?? "?"} le ${new Date(
      b.sms_timestamp
    ).toLocaleString("fr-FR")}`;
  }
  return "";
}

/**
 * Combine provider + category en libellé court pour les chips.
 * Doit rester aligné avec MainActivity.accountLabel() côté Android.
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

  if (provider === "WAVE" && category !== "WAVE_NORMAL") {
    return category === "MONEY" ? "Wave (legacy)" : `Wave (${category.toLowerCase()})`;
  }
  return baseLabel;
}
