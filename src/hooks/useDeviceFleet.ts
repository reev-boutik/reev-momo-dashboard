import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "../lib/supabase";

/**
 * Représentation d'un téléphone dans la flotte, agrégée depuis la vue
 * `device_fleet` côté Supabase (heartbeat + nb commandes pending + dernière
 * commande exécutée).
 */
export interface DeviceFleetEntry {
  device_id: string;
  device_label: string;
  last_seen: string;
  connectivity_status: "online" | "recent" | "offline";
  seconds_since_last_seen: number;
  app_version: string | null;
  app_version_code: number | null;
  android_version: string | null;
  notification_access: boolean | null;
  is_service_running: boolean | null;
  n_local_rows: number | null;
  n_unsynced: number | null;
  n_rejected: number | null;
  is_orange_pay_device: boolean | null;
  last_notif_at: string | null;
  n_pending_commands: number;
  last_cmd_type: string | null;
  last_cmd_status: string | null;
  last_cmd_completed_at: string | null;
  last_cmd_created_at: string | null;
}

/**
 * Hook qui charge la liste des téléphones de la flotte (Reev Guard).
 *
 * Auto-refresh toutes les 10 secondes pour avoir une vue quasi temps réel
 * du statut online/offline et des commandes en cours d'exécution.
 *
 * Renvoie aussi une fonction `refresh()` pour forcer un reload immédiat
 * (utile après l'envoi d'une commande).
 */
export function useDeviceFleet() {
  const [data, setData] = useState<DeviceFleetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supa = getSupabase();
      if (!supa) {
        setLoading(false);
        return;
      }

      const { data: rows, error: err } = await supa
        .from("device_fleet")
        .select("*")
        .order("connectivity_status", { ascending: true })
        .order("device_label", { ascending: true });

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setError(null);
      setData((rows as DeviceFleetEntry[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Auto-refresh toutes les 10 secondes
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error, refresh };
}

/**
 * Une commande historique stockée dans `device_commands`.
 */
export interface DeviceCommand {
  id: number;
  device_id: string;
  cmd_type: string;
  params: Record<string, unknown> | null;
  status: "pending" | "picked" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  result: Record<string, unknown> | null;
  error_message: string | null;
  issued_by: string | null;
  created_at: string;
  picked_at: string | null;
  completed_at: string | null;
}

/**
 * Hook qui charge l'historique récent des commandes pour un device,
 * ou toutes si deviceId == null.
 */
export function useDeviceCommands(deviceId: string | null, limit: number = 50) {
  const [data, setData] = useState<DeviceCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supa = getSupabase();
      if (!supa) {
        setLoading(false);
        return;
      }

      let query = supa
        .from("device_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (deviceId) {
        query = query.eq("device_id", deviceId);
      }

      const { data: rows } = await query;
      if (cancelled) return;
      setData((rows as DeviceCommand[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [deviceId, limit, tick]);

  // Auto-refresh toutes les 5 secondes
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, refresh };
}

/**
 * Envoie une nouvelle commande à un téléphone.
 *
 * @param deviceId UUID du téléphone cible
 * @param cmdType type de commande (cf. CommandExecutor côté Android)
 * @param params paramètres optionnels (ex. {label: "MOOV"} pour set_label)
 */
export async function sendCommand(
  deviceId: string,
  cmdType: string,
  params?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supa = getSupabase();
  if (!supa) return { success: false, error: "Supabase non configuré" };

  const { error } = await supa.from("device_commands").insert({
    device_id: deviceId,
    cmd_type: cmdType,
    params: params ?? null,
    status: "pending",
    issued_by: "dashboard",
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
