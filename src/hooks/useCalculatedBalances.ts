import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

/**
 * Solde calculé via la vue Supabase `calculated_balances` :
 *
 *   solde = ancre.balance + Σ(amount IN) − Σ(amount OUT)  pour les rows
 *   capturées après ancre.anchored_at.
 *
 * Utilisé pour les comptes dont les notifs n'incluent pas le solde
 * (Wave Marchand surtout), mais applicable à n'importe quel compte
 * pour corriger une dérive.
 *
 * Cf. supabase/balance_anchors_migration.sql pour la définition de la vue.
 */
export interface CalculatedBalance {
  provider: string;
  category: string;             // 'MONEY' | 'CABINE' | 'PAY' | 'WAVE_NORMAL' | 'WAVE_MARCHAND'
  anchor_balance: number;       // solde saisi manuellement au moment de l'ancre
  anchor_at: string;            // ISO timestamp UTC du moment de la calibration
  anchor_device: string | null;
  anchor_source: string;        // 'manual_app' / 'manual_dashboard' / 'init'
  net_delta: number;            // somme algébrique des transactions après ancre
  n_transactions_since_anchor: number;
  calculated_balance: number;   // anchor_balance + net_delta
}

/**
 * Hook React qui charge tous les soldes calculés depuis Supabase.
 *
 * Renvoie une Map indexée par `${provider}|${category}` pour lookup rapide
 * depuis BalanceBar / autres composants.
 *
 * Refresh manuel possible via la fonction `refresh()` retournée — utile
 * juste après que l'utilisateur ait calibré un solde depuis le dashboard.
 */
export function useCalculatedBalances() {
  const [byKey, setByKey] = useState<Map<string, CalculatedBalance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supa = getSupabase();
      if (!supa) {
        setLoading(false);
        return;
      }

      const { data: rows, error } = await supa
        .from("calculated_balances")
        .select(
          "provider, category, anchor_balance, anchor_at, anchor_device, anchor_source, net_delta, n_transactions_since_anchor, calculated_balance"
        );

      if (cancelled) return;
      if (error || !rows) {
        // Si la vue n'existe pas (migration pas encore lancée), on
        // dégrade silencieusement : pas de calculated_balance, fallback
        // sur les soldes des notifs côté useLatestBalances.
        if (error) {
          console.warn("calculated_balances unavailable", error.message);
        }
        setByKey(new Map());
        setLoading(false);
        return;
      }

      const map = new Map<string, CalculatedBalance>();
      for (const r of rows as CalculatedBalance[]) {
        map.set(`${r.provider}|${r.category}`, r);
      }
      setByKey(map);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  function refresh() {
    setRefreshTick((t) => t + 1);
  }

  return { byKey, loading, refresh };
}
