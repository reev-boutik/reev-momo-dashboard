import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export interface ProviderBalance {
  provider: string;
  category: string;             // 'MONEY' | 'CABINE' | 'WAVE_NORMAL' | 'WAVE_MARCHAND'
  balance: number;
  device_id: string;
  device_label: string;
  sms_timestamp: string;
}

/**
 * Récupère le dernier solde connu par (device, provider, category).
 * Indépendant de la période sélectionnée — montre toujours l'état actuel.
 *
 * Logique : pour chaque (device_id, provider, category), on prend la
 * transaction la plus récente avec balance != null. Le total = somme des
 * soldes par device+provider+category.
 *
 * Le découpage par catégorie permet de séparer p.ex. le solde du compte
 * Moov Money principal (category=MONEY) du solde EVD du compte Moov
 * Cabine (category=CABINE), qui sont 2 portefeuilles distincts pour le
 * même provider.
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
      const { data: rows, error } = await supa
        .from("momo_auto_capture")
        .select("provider, category, balance, device_id, device_label, sms_timestamp")
        .not("balance", "is", null)
        .order("sms_timestamp", { ascending: false })
        .limit(2000);

      if (cancelled) return;
      if (error || !rows) {
        setLoading(false);
        return;
      }
      // Garde la première occurrence (donc la plus récente) pour chaque
      // (device_id|provider|category). Les rows sans category (anciennes,
      // avant la migration v4→v5) tombent en 'MONEY' par défaut.
      const seen = new Set<string>();
      const latest: ProviderBalance[] = [];
      for (const r of rows as Array<ProviderBalance & { category: string | null }>) {
        const cat = r.category ?? "MONEY";
        const key = `${r.device_id}|${r.provider}|${cat}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latest.push({ ...r, category: cat });
      }
      setData(latest);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
