import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export interface ProviderBalance {
  provider: string;
  category: string;             // 'MONEY' | 'CABINE' | 'PAY' | 'WAVE_NORMAL' | 'WAVE_MARCHAND'
  balance: number;
  device_id: string;            // device qui a rapporté ce solde le plus récemment
  device_label: string;
  sms_timestamp: string;
}

/**
 * Récupère le solde le plus récent pour chaque (provider, category),
 * indépendamment du device qui l'a rapporté.
 *
 * Logique : on parcourt les transactions ordonnées DESC par sms_timestamp,
 * on garde le 1er row rencontré pour chaque clé `provider|category`. Le
 * device qui a rapporté ce solde est conservé dans le résultat (pour
 * info / tooltip), mais on n'agrège PAS plusieurs devices ensemble.
 *
 * Pourquoi pas par device : un même portefeuille (p.ex. Orange Pay) peut
 * être suivi sur plusieurs téléphones (réinstallation, changement de
 * device_id, etc.). Sommer les balances par device produirait des chiffres
 * artificiellement élevés. La balance courante d'un compte est UN nombre,
 * pas une somme — c'est le dernier snapshot envoyé par n'importe quel
 * téléphone qui a la notif active.
 *
 * Pour le cas peu fréquent où plusieurs caisses gèrent VRAIMENT des
 * comptes distincts du même type (p.ex. 2 caisses avec 2 comptes Orange
 * Money séparés), seule la plus récente sera affichée. C'est le compromis
 * accepté pour avoir une vue compacte sans cumuls bidons.
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
      // Pour chaque (provider, category), garde uniquement la 1re occurrence
      // (donc la plus récente, peu importe le device). Les rows sans
      // category (anciennes, avant migration v4→v5) tombent en 'MONEY'.
      const seen = new Set<string>();
      const latest: ProviderBalance[] = [];
      for (const r of rows as Array<ProviderBalance & { category: string | null }>) {
        const cat = r.category ?? "MONEY";
        const key = `${r.provider}|${cat}`;
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
