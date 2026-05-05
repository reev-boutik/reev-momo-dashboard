import { useState } from "react";
import { getSupabase } from "../lib/supabase";
import { parseFields } from "../lib/momoParser";

interface Row {
  id: number;
  raw_text: string | null;
  counterparty: string | null;
  amount: number | null;
  balance: number | null;
  fee: number | null;
  reference: string | null;
  type: string | null;
}

interface DiffPreview {
  id: number;
  before: Partial<Row>;
  after: Partial<Row>;
}

/**
 * Page admin pour re-analyser toutes les transactions en base.
 *
 * Pourquoi : quand le parser est amélioré (ex. nouvelle extraction du numéro de
 * téléphone Wave Business), les transactions déjà en base ne sont pas mises à
 * jour automatiquement. Cette page relit `raw_text` et applique le parser JS
 * (porté du Kotlin) pour mettre à jour `counterparty`, `fee`, etc.
 *
 * Politique : on n'écrase QUE les champs vides (NULL ou chaîne vide). Si une
 * transaction a déjà un counterparty manuel, on ne le touche pas. Évite de
 * détruire des annotations admin.
 */
export default function ReparseAdmin() {
  const [phase, setPhase] = useState<"idle" | "scanning" | "preview" | "applying" | "done">("idle");
  const [scanned, setScanned] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [diffs, setDiffs] = useState<DiffPreview[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Scanne toute la table et calcule les diffs sans écrire */
  async function dryRun() {
    const supa = getSupabase();
    if (!supa) { setError("Supabase non configuré"); return; }
    setPhase("scanning");
    setError(null);
    setDiffs([]);
    let from = 0;
    const pageSize = 1000;
    const previews: DiffPreview[] = [];
    let total = 0;

    while (true) {
      const { data, error: e } = await supa
        .from("momo_auto_capture")
        .select("id, raw_text, counterparty, amount, balance, fee, reference, type")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (e) { setError(e.message); setPhase("idle"); return; }
      if (!data || data.length === 0) break;

      for (const row of data as Row[]) {
        total++;
        if (!row.raw_text) continue;
        const parsed = parseFields(row.raw_text);
        const diff: Partial<Row> = {};
        // On n'écrase que si le champ actuel est null/vide
        if (parsed.counterparty && !row.counterparty) diff.counterparty = parsed.counterparty;
        if (parsed.fee != null && row.fee == null) diff.fee = parsed.fee;
        if (parsed.reference && !row.reference) diff.reference = parsed.reference;
        // On NE touche PAS à amount/balance/type — risque trop élevé sur lignes existantes
        if (Object.keys(diff).length > 0) {
          previews.push({
            id: row.id,
            before: { counterparty: row.counterparty, fee: row.fee, reference: row.reference },
            after: diff,
          });
        }
      }
      setScanned(total);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    setDiffs(previews);
    setPhase("preview");
  }

  /** Applique les diffs détectés */
  async function apply() {
    const supa = getSupabase();
    if (!supa) return;
    setPhase("applying");
    let ok = 0;
    for (const d of diffs) {
      const { error: e } = await supa
        .from("momo_auto_capture")
        .update(d.after)
        .eq("id", d.id);
      if (!e) ok++;
      setUpdated(ok);
    }
    setPhase("done");
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">Re-analyser les transactions</h1>
        <p className="text-sm text-slate-500 mt-1">
          Relit le SMS brut (raw_text) de chaque transaction et complète les champs manquants
          (numéro de téléphone, frais, référence). N'écrase jamais les données existantes.
        </p>
      </header>

      {phase === "idle" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 space-y-4">
          <p className="text-sm">
            Première étape : <b>scanner</b> toute la base pour voir ce qui peut être amélioré.
            Aucune écriture ne sera faite sans ta confirmation.
          </p>
          <button
            onClick={dryRun}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            Scanner la base
          </button>
        </div>
      )}

      {phase === "scanning" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <p className="text-sm">Scan en cours... {scanned} transactions analysées</p>
        </div>
      )}

      {phase === "preview" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 p-4">
            <p className="text-sm">
              <b>{scanned}</b> transactions scannées · <b>{diffs.length}</b> peuvent être enrichies
            </p>
          </div>

          {diffs.length > 0 ? (
            <>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="text-left p-2">ID</th>
                      <th className="text-left p-2">Champ</th>
                      <th className="text-left p-2">Avant</th>
                      <th className="text-left p-2">Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.slice(0, 50).map((d) => (
                      Object.keys(d.after).map((k) => (
                        <tr key={`${d.id}-${k}`} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="p-2 font-mono text-xs">{d.id}</td>
                          <td className="p-2 text-xs">{k}</td>
                          <td className="p-2 text-xs text-slate-500">
                            {(d.before as any)[k] ?? <i>vide</i>}
                          </td>
                          <td className="p-2 text-xs font-medium text-emerald-600">
                            {String((d.after as any)[k])}
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
                {diffs.length > 50 && (
                  <p className="p-3 text-xs text-slate-500 italic">
                    … et {diffs.length - 50} autres modifications similaires
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={apply}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Appliquer les {diffs.length} modifications
                </button>
                <button
                  onClick={() => { setPhase("idle"); setDiffs([]); setScanned(0); }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                >
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => { setPhase("idle"); setScanned(0); }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            >
              Retour
            </button>
          )}
        </div>
      )}

      {phase === "applying" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <p className="text-sm">Mise à jour... {updated} / {diffs.length}</p>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 p-6 space-y-3">
          <p className="text-lg font-medium">✓ Terminé</p>
          <p className="text-sm">{updated} transactions mises à jour avec succès.</p>
          <button
            onClick={() => { setPhase("idle"); setDiffs([]); setScanned(0); setUpdated(0); }}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg"
          >
            Nouveau scan
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950 p-4 text-sm text-rose-700 dark:text-rose-300">
          Erreur : {error}
        </div>
      )}
    </div>
  );
}
