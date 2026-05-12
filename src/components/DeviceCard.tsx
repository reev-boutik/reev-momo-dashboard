import { useState } from "react";
import { DeviceFleetEntry, sendCommand } from "../hooks/useDeviceFleet";

interface Props {
  device: DeviceFleetEntry;
  onCommandSent: () => void;
}

/**
 * Une carte par caisse dans le dashboard /pilotage.
 *
 * Affiche :
 *  - Label de la caisse + statut online/recent/offline
 *  - Métadonnées (version APK, transactions locales, unsynced, rejetés)
 *  - Boutons d'action remote
 *
 * Les boutons envoient des commandes via sendCommand qui insère dans
 * device_commands. Le téléphone va poll cette table dans les 30 secondes
 * suivantes et exécuter.
 */
export default function DeviceCard({ device, onCommandSent }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [newLabel, setNewLabel] = useState(device.device_label);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  async function trigger(
    cmdType: string,
    params?: Record<string, unknown>,
    confirmMessage?: string
  ) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(cmdType);
    const res = await sendCommand(device.device_id, cmdType, params);
    setBusy(null);
    if (res.success) {
      onCommandSent();
    } else {
      alert(`Échec : ${res.error}`);
    }
  }

  async function handleSetLabel() {
    const label = newLabel.trim();
    if (!label || label === device.device_label) {
      setShowLabelInput(false);
      return;
    }
    await trigger("set_label", { label });
    setShowLabelInput(false);
  }

  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 flex flex-col gap-3">
      {/* En-tête : statut + label */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ConnectivityDot status={device.connectivity_status} />
          {showLabelInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="border rounded px-2 py-0.5 text-sm font-bold w-40"
                autoFocus
              />
              <button
                onClick={handleSetLabel}
                disabled={busy === "set_label"}
                className="text-sm px-2 py-0.5 rounded bg-brand-500 text-white"
              >
                {busy === "set_label" ? "..." : "OK"}
              </button>
              <button
                onClick={() => {
                  setShowLabelInput(false);
                  setNewLabel(device.device_label);
                }}
                className="text-sm px-2 py-0.5 rounded text-gray-600"
              >
                ✕
              </button>
            </div>
          ) : (
            <h3
              className="font-bold text-lg truncate cursor-pointer hover:text-brand-600"
              onClick={() => setShowLabelInput(true)}
              title="Cliquer pour renommer"
            >
              {device.device_label || `Caisse-${device.device_id.slice(0, 8)}`}
              <span className="ml-1 text-xs text-gray-400">✏️</span>
            </h3>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {formatLastSeen(device.seconds_since_last_seen)}
        </span>
      </div>

      {/* Métadonnées */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <Meta label="Version APK" value={device.app_version ?? "?"} suffix={device.app_version_code ? `(${device.app_version_code})` : undefined} />
        <Meta label="Android" value={device.android_version ?? "?"} />
        <Meta
          label="Transactions"
          value={device.n_local_rows?.toLocaleString("fr-FR") ?? "?"}
        />
        <Meta
          label="Non sync"
          value={device.n_unsynced?.toString() ?? "?"}
          variant={device.n_unsynced && device.n_unsynced > 0 ? "warning" : undefined}
        />
        <Meta
          label="Rejetés"
          value={device.n_rejected?.toString() ?? "?"}
          variant={device.n_rejected && device.n_rejected > 0 ? "warning" : undefined}
        />
        <Meta
          label="Notifs accès"
          value={device.notification_access ? "✓" : "✗"}
          variant={device.notification_access ? "ok" : "error"}
        />
        <Meta
          label="Service"
          value={device.is_service_running ? "✓" : "✗"}
          variant={device.is_service_running ? "ok" : "error"}
        />
        <Meta
          label="Orange Pay"
          value={device.is_orange_pay_device ? "OUI" : "non"}
          variant={device.is_orange_pay_device ? "highlight" : undefined}
        />
      </div>

      {/* Indicateur commandes en attente */}
      {device.n_pending_commands > 0 && (
        <div className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 font-medium">
          ⏳ {device.n_pending_commands} commande(s) en attente
        </div>
      )}

      {/* Dernière commande */}
      {device.last_cmd_type && (
        <div className="text-xs text-gray-500">
          Dernière commande : <strong>{device.last_cmd_type}</strong> —{" "}
          <CommandStatusBadge status={device.last_cmd_status ?? "?"} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        <ActionButton
          label="↻ Heartbeat"
          onClick={() => trigger("heartbeat_now")}
          busy={busy === "heartbeat_now"}
          tooltip="Force le téléphone à pousser son état immédiatement"
        />
        <ActionButton
          label="🔄 Reparser"
          onClick={() =>
            trigger(
              "reparse_all",
              undefined,
              `Reparser TOUTES les transactions sur ${device.device_label} ?`
            )
          }
          busy={busy === "reparse_all"}
          tooltip="Reparse toutes les transactions locales avec le parser actuel"
        />
        <ActionButton
          label="☁️ Resync"
          onClick={() =>
            trigger(
              "resync_all",
              undefined,
              `Re-uploader TOUTES les transactions vers Supabase depuis ${device.device_label} ?`
            )
          }
          busy={busy === "resync_all"}
          tooltip="Marque tout comme non-synced puis upload"
        />
        <ActionButton
          label="🔍 Rescan notifs"
          onClick={() => trigger("rescan_active")}
          busy={busy === "rescan_active"}
          tooltip="Force un rebalayage des notifications visibles à l'écran"
        />
        <ActionButton
          label="♻️ Retry rejetés"
          onClick={() => trigger("retry_rejected")}
          busy={busy === "retry_rejected"}
          tooltip="Re-essaie de parser les SMS rejetés avec le parser actuel"
        />
        <ActionButton
          label={`📡 Orange Pay : ${device.is_orange_pay_device ? "OUI" : "non"}`}
          onClick={() =>
            trigger(
              "set_orange_pay_flag",
              { enabled: !device.is_orange_pay_device },
              device.is_orange_pay_device
                ? "Désactiver le flag Orange Pay sur ce téléphone ?"
                : "Activer le flag Orange Pay sur ce téléphone ?"
            )
          }
          busy={busy === "set_orange_pay_flag"}
          variant={device.is_orange_pay_device ? "highlight" : undefined}
          tooltip="Toggle le flag isOrangePayDevice + reparseAll automatique"
        />
        <ActionButton
          label="🗑️ Vider DB locale"
          onClick={() =>
            trigger(
              "clear_local_db",
              undefined,
              `⚠️ DANGER : Vider la DB locale de ${device.device_label} ? Toutes les transactions locales seront perdues (Supabase reste intact).`
            )
          }
          busy={busy === "clear_local_db"}
          variant="danger"
          tooltip="Supprime toutes les transactions locales du téléphone"
        />
      </div>

      <div className="text-xs text-gray-400 mt-1">
        ID : <code>{device.device_id.slice(0, 8)}...</code>
      </div>
    </div>
  );
}

function ConnectivityDot({ status }: { status: "online" | "recent" | "offline" }) {
  const color =
    status === "online" ? "bg-green-500" :
    status === "recent" ? "bg-amber-400" :
    "bg-gray-400";
  const label =
    status === "online" ? "En ligne" :
    status === "recent" ? "Récent" :
    "Hors ligne";
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
      title={label}
    />
  );
}

function Meta({
  label,
  value,
  suffix,
  variant,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  variant?: "ok" | "warning" | "error" | "highlight";
}) {
  const valueColor =
    variant === "ok" ? "text-green-600" :
    variant === "warning" ? "text-amber-700" :
    variant === "error" ? "text-red-600" :
    variant === "highlight" ? "text-brand-600 font-bold" :
    "text-gray-900";
  return (
    <div className="text-xs">
      <div className="text-gray-500">{label}</div>
      <div className={`font-mono ${valueColor}`}>
        {value} {suffix && <span className="text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
  tooltip,
  variant,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  tooltip?: string;
  variant?: "danger" | "highlight";
}) {
  const baseClass = "text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50";
  const variantClass =
    variant === "danger" ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" :
    variant === "highlight" ? "bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100" :
    "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={tooltip}
      className={`${baseClass} ${variantClass}`}
    >
      {busy ? "…" : label}
    </button>
  );
}

function CommandStatusBadge({ status }: { status: string }) {
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
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

function formatLastSeen(seconds: number): string {
  if (seconds < 60) return `il y a ${seconds}s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)}h`;
  return `il y a ${Math.floor(seconds / 86400)}j`;
}
