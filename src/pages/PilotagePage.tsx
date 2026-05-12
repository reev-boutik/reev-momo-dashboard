import { useState } from "react";
import {
  useDeviceFleet,
  useDeviceCommands,
  sendCommand,
  DeviceCommand,
} from "../hooks/useDeviceFleet";
import DeviceCard from "../components/DeviceCard";

/**
 * Page /pilotage — Reev Guard.
 *
 * Permet de piloter la flotte de téléphones caisses à distance, sans avoir
 * à se déplacer physiquement à la boutique.
 *
 * Sections :
 *  1. Vue d'ensemble (compteurs : online, offline, etc.)
 *  2. Cartes par téléphone (DeviceCard) — actions remote
 *  3. Historique récent des commandes (visibilité du résultat)
 *  4. Actions broadcast (sur toute la flotte d'un coup)
 */
export default function PilotagePage() {
  const { data: devices, loading, error, refresh: refreshFleet } = useDeviceFleet();
  const { data: commands, refresh: refreshCommands } = useDeviceCommands(null, 30);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);

  function refresh() {
    refreshFleet();
    refreshCommands();
  }

  async function broadcastCommand(cmdType: string, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setBroadcasting(cmdType);
    for (const d of devices) {
      await sendCommand(d.device_id, cmdType);
    }
    setBroadcasting(null);
    refresh();
  }

  const counts = {
    online: devices.filter((d) => d.connectivity_status === "online").length,
    recent: devices.filter((d) => d.connectivity_status === "recent").length,
    offline: devices.filter((d) => d.connectivity_status === "offline").length,
    pending: devices.reduce((s, d) => s + d.n_pending_commands, 0),
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold">Pilotage de flotte</h1>
        <p className="text-sm text-gray-600 mt-1">
          Reev Guard — contrôle les caisses à distance. Reparser, resync, vider,
          changer les flags, surveiller l'état. Auto-refresh toutes les 10 secondes.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          Erreur : {error}
        </div>
      )}

      {/* Vue d'ensemble */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="En ligne" value={counts.online} color="green" />
        <Stat label="Récents" value={counts.recent} color="amber" />
        <Stat label="Hors ligne" value={counts.offline} color="gray" />
        <Stat label="Commandes en cours" value={counts.pending} color="blue" />
      </div>

      {/* Actions broadcast */}
      <div className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs uppercase opacity-80">Actions broadcast</div>
            <div className="text-sm opacity-90">
              S'applique à toutes les caisses ({devices.length})
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <BroadcastButton
              label="↻ Heartbeat global"
              onClick={() =>
                broadcastCommand(
                  "heartbeat_now",
                  `Demander un heartbeat à toutes les ${devices.length} caisses ?`
                )
              }
              busy={broadcasting === "heartbeat_now"}
            />
            <BroadcastButton
              label="🔄 Reparser tout"
              onClick={() =>
                broadcastCommand(
                  "reparse_all",
                  `Reparser TOUTES les transactions sur les ${devices.length} caisses ? Cette opération peut prendre plusieurs minutes par caisse.`
                )
              }
              busy={broadcasting === "reparse_all"}
            />
            <BroadcastButton
              label="☁️ Resync tout"
              onClick={() =>
                broadcastCommand(
                  "resync_all",
                  `Re-uploader TOUTES les transactions des ${devices.length} caisses vers Supabase ?`
                )
              }
              busy={broadcasting === "resync_all"}
            />
          </div>
        </div>
      </div>

      {/* Liste des téléphones */}
      <section>
        <h2 className="text-lg font-bold mb-3">
          Caisses{" "}
          <span className="text-sm font-normal text-gray-500">
            ({devices.length})
          </span>
        </h2>
        {loading && <div className="text-sm text-gray-500">Chargement…</div>}
        {!loading && devices.length === 0 && (
          <div className="text-sm text-gray-500 italic">
            Aucune caisse n'a encore envoyé de heartbeat. Vérifie que l'APK
            Reev MoMo est installée et configurée sur au moins un téléphone.
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard key={d.device_id} device={d} onCommandSent={refresh} />
          ))}
        </div>
      </section>

      {/* Historique récent */}
      <section>
        <h2 className="text-lg font-bold mb-3">
          Historique des commandes{" "}
          <span className="text-sm font-normal text-gray-500">
            (30 dernières)
          </span>
        </h2>
        <CommandLogTable
          commands={commands}
          devices={devices.reduce(
            (acc, d) => ({ ...acc, [d.device_id]: d.device_label }),
            {} as Record<string, string>
          )}
        />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "amber" | "gray" | "blue";
}) {
  const colors = {
    green: "bg-green-50 text-green-800 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    gray: "bg-gray-50 text-gray-800 border-gray-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function BroadcastButton({
  label,
  onClick,
  busy,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-xs px-3 py-1.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50"
    >
      {busy ? "…" : label}
    </button>
  );
}

function CommandLogTable({
  commands,
  devices,
}: {
  commands: DeviceCommand[];
  devices: Record<string, string>;
}) {
  if (commands.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        Aucune commande envoyée pour l'instant.
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Quand</th>
            <th className="px-3 py-2 text-left">Caisse</th>
            <th className="px-3 py-2 text-left">Commande</th>
            <th className="px-3 py-2 text-left">Statut</th>
            <th className="px-3 py-2 text-left">Résultat</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((c) => (
            <tr key={c.id} className="border-t border-gray-100">
              <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                {new Date(c.created_at).toLocaleString("fr-FR")}
              </td>
              <td className="px-3 py-2 font-medium">
                {devices[c.device_id] ?? c.device_id.slice(0, 8)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{c.cmd_type}</td>
              <td className="px-3 py-2">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-3 py-2 text-xs text-gray-700 max-w-md truncate">
                {c.error_message
                  ? <span className="text-red-600">{c.error_message}</span>
                  : c.result
                    ? <code>{JSON.stringify(c.result)}</code>
                    : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    picked: "bg-blue-100 text-blue-800",
    running: "bg-amber-100 text-amber-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
    timeout: "bg-red-100 text-red-800",
  };
  const cls = colorMap[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
