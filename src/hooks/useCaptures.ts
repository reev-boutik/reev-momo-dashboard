import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import type { AutoCapture } from "../lib/types";

interface Options {
  /** ISO date — ne ramène que les captures à partir de cette date */
  since?: string | null;
  /** ISO date — borne haute (utile pour "perso") */
  until?: string | null;
  /** Limite (par défaut 1000) */
  limit?: number;
  /** Filtre device */
  deviceId?: string;
  /** Active la souscription realtime (par défaut true) */
  realtime?: boolean;
}

/**
 * Charge la liste des captures + écoute les nouveaux INSERT en temps réel
 * via le canal realtime de Supabase. Met à jour automatiquement le state
 * quand une nouvelle transaction arrive d'un téléphone.
 */
export function useCaptures(opts: Options = {}) {
  const { since, until, limit = 1000, deviceId, realtime = true } = opts;
  const [data, setData] = useState<AutoCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supa = getSupabase();
    if (!supa) {
      setError("Configuration Supabase manquante");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      let q = supa!
        .from("momo_auto_capture")
        .select("*")
        .order("sms_timestamp", { ascending: false })
        .limit(limit);
      if (since) q = q.gte("sms_timestamp", since);
      if (until) q = q.lte("sms_timestamp", until);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data: rows, error: err } = await q;
      if (cancelled) return;
      if (err) setError(err.message);
      else setData((rows ?? []) as AutoCapture[]);
      setLoading(false);
    }
    load();

    if (!realtime) return () => { cancelled = true; };

    // Souscription aux nouvelles captures
    const channel = supa
      .channel("momo_auto_capture_inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "momo_auto_capture" },
        (payload) => {
          const row = payload.new as AutoCapture;
          // On respecte les filtres locaux si présents
          if (since && row.sms_timestamp < since) return;
          if (until && row.sms_timestamp > until) return;
          if (deviceId && row.device_id !== deviceId) return;
          setData((prev) => [row, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supa.removeChannel(channel);
    };
  }, [since, until, limit, deviceId, realtime]);

  return { data, loading, error };
}
