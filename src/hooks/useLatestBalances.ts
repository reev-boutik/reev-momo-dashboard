import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export interface ProviderBalance {
  provider: string;
  balance: number;
  device_id: string;
  device_label: string;
  sms_timestamp: string;
}

/**
 * Récupère le dernier solde connu par (device, provider).
 * Indépendant de la période sélectionnée — montre toujours l'état actuel.
 *
 * Logique : pour chaque (device_id, provider), on prend la transaction la plus
 * récente avec balance != null. Le total = somme des soldes par device+provider.
 */
export function useLatestBalances() {
  const [data, setData] = useState<ProviderBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supa = getSupabase();
      if (!supa) {
        setLoading(false);
        return;
      }
      // On récupère un échantillon récent et on filtre côté client
      // (limite Supabase + pas de DISTINCT ON dans la lib JS)
      const { data: rows, error } = await supa
        .from("momo_auto_capture")
        .select("provider, balance, device_id, device_label, sms_timestamp")
        .not("balance", "is", null)
        .order("sms_timestamp", { ascending: false })
        .limit(2000);

      if (cancelled) return;
      if (error || !rows) {
        setLoading(false);
        return;
      }
      // Garde la première occurrence (donc la plus récente) pour chaque
      // (device_id|provider)
      const seen = new Set<string>();
      const latest: ProviderBalance[] = [];
      for (const r of rows as ProviderBalance[]) {
        const key = `${r.device_id}|${r.provider}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latest.push(r);
      }
      setData(latest);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
