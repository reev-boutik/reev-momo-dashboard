import { useState } from "react";
import { getSupabase } from "../lib/supabase";

interface Props {
  /** Provider du compte (ex. "WAVE", "ORANGE_MONEY"). */
  provider: string;
  /** Category du compte (ex. "WAVE_MARCHAND", "MONEY"). */
  category: string;
  /** Label affichable (ex. "Wave Marchand"). */
  accountLabel: string;
  /** Solde courant connu (pour pré-remplir le champ). */
  currentBalance?: number;
  /** Source du calcul actuel ("auto" depuis notifs, "calculated" depuis ancre). */
  currentSource?: "auto" | "calculated";
  /** Callback appelé après une calibration réussie (pour refresh). */
  onSuccess?: () => void;
  /** Callback de fermeture (Cancel ou clic en dehors). */
  onClose: () => void;
}

/**
 * Dialog de calibration manuelle d'un solde depuis le dashboard.
 *
 * L'utilisateur saisit le solde réel actuel du compte (typiquement
 * relevé dans l'app de l'opérateur, par exemple Wave Business). Le
 * dialog insère une row dans `balance_anchors` côté Supabase, et le
 * dashboard recalculera le solde affiché à la prochaine refresh.
 *
 * ## Mirror de BalanceCalibrationActivity côté Android
 *
 * Les deux endroits (app + dashboard) écrivent dans la même table
 * `balance_anchors`. La dernière ancre par (provider, category) fait foi
 * pour le calcul du solde via la vue `calculated_balances`.
 */
export default function CalibrateBalanceDialog({
  provider,
  category,
  accountLabel,
  currentBalance,
  currentSource,
  onSuccess,
  onClose,
}: Props) {
  const [value, setValue] = useState<string>(
    currentBalance !== undefined ? String(currentBalance) : ""
  );
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setError(null);
    const num = parseFloat(value.replace(/\s/g, "").replace(",", "."));
    if (isNaN(num) || num < 0) {
      setError("Solde invalide. Entre un nombre positif (ex. 14268 ou 14268.50).");
      return;
    }
    const supa = getSupabase();
    if (!supa) {
      setError("Supabase non configuré.");
      return;
    }

    setSubmitting(true);
    const { error: err } = await supa.from("balance_anchors").insert({
      provider,
      category,
      balance: num,
      anchored_at: new Date().toISOString(),
      source: "manual_dashboard",
      note: note.trim() || null,
    });
    setSubmitting(false);

    if (err) {
      setError(`Échec : ${err.message}`);
      return;
    }
    onSuccess?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-2">Calibrer {accountLabel}</h2>
        <p className="text-sm text-gray-600 mb-4">
          Saisis le solde réel actuel du compte (relevé dans l'app de
          l'opérateur, ex. Wave Business). Le dashboard utilisera ce point
          de référence et ajoutera/retirera les transactions captées
          ensuite.
        </p>

        {currentBalance !== undefined && (
          <div className="text-xs text-gray-500 mb-3">
            Solde affiché actuellement :{" "}
            <span className="font-mono">{currentBalance.toLocaleString("fr-FR")} F</span>
            {currentSource === "auto" && " (extrait des notifs)"}
            {currentSource === "calculated" && " (calculé depuis dernière ancre)"}
          </div>
        )}

        <label className="block text-sm font-medium mb-1">Solde actuel en FCFA</label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          className="w-full border rounded px-3 py-2 mb-3 font-mono text-lg"
          placeholder="14268"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <label className="block text-sm font-medium mb-1">Note (optionnel)</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 mb-4 text-sm"
          placeholder="Ex: après réception du remboursement Wave"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded text-gray-700 hover:bg-gray-100"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || value.trim() === ""}
            className="px-4 py-2 rounded bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
