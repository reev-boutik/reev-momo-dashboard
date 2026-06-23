import { useEffect, useMemo, useState } from "react";
import ExportButton from "../components/ExportButton";
import { fmtMoney, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";
import { getSupabase } from "../lib/supabase";

type SortKey =
  | "sms_timestamp"
  | "device_label"
  | "provider"
  | "type"
  | "amount"
  | "fee"
  | "balance"
  | "reference"
  | "counterparty";

type SortDir = "asc" | "desc";

const PAGE_SIZES = [25, 50, 100];

/** Total signé d'une transaction = montant signé - frais */
function rowTotal(r: AutoCapture): number | null {
  if (r.amount == null) return null;
  const sign = r.type === "OUTGOING" ? -1 : 1;
  const fee = r.fee ?? 0;
  return sign * r.amount - fee;
}

export default function History() {
  const [provider, setProvider] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [device, setDevice] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("sms_timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(50);

  const [rows, setRows] = useState<AutoCapture[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<boolean>(false);
  const [devices, setDevices] = useState<Array<[string, string]>>([]);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // Debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Retour page 1 quand un filtre change
  useEffect(() => {
    setPage(0);
  }, [provider, type, device, amountMin, amountMax, debouncedSearch, sortKey, sortDir, pageSize]);

  // Liste des caisses
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) return;
    let cancelled = false;
    (async () => {
      const { data } = await supa
        .from("momo_auto_capture")
        .select("device_id, device_label")
        .order("sms_timestamp", { ascending: false })
        .limit(1000);
      if (cancelled || !data) return;
      const m = new Map<string, string>();
      for (const r of data as Array<{ device_id: string; device_label: string | null }>) {
        m.set(r.device_id, r.device_label || r.device_id);
      }
      setDevices(Array.from(m.entries()));
    })();
    return () => { cancelled = true; };
  }, []);

  // Chargement paginé serveur
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) { setError("Configuration Supabase manquante"); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let q = supa
        .from("momo_auto_capture")
        .select("*", { count: "exact" })
        .order(sortKey, { ascending: sortDir === "asc" });
      if (provider) q = q.eq("provider", provider);
      if (type) q = q.eq("type", type);
      if (device) q = q.eq("device_id", device);
      if (amountMin !== "" && Number.isFinite(Number(amountMin))) q = q.gte("amount", Number(amountMin));
      if (amountMax !== "" && Number.isFinite(Number(amountMax))) q = q.lte("amount", Number(amountMax));
      const s = debouncedSearch.replace(/[,()]/g, " ").trim();
      if (s) {
        q = q.or(
          `raw_text.ilike.%${s}%,counterparty.ilike.%${s}%,reference.ilike.%${s}%,device_label.ilike.%${s}%`
        );
      }
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, count, error: err } = await q;
      if (cancelled) return;
      if (err) { setError(err.message); setRows([]); setTotal(0); }
      else { setRows((data ?? []) as AutoCapture[]); setTotal(count ?? 0); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [provider, type, device, amountMin, amountMax, debouncedSearch, sortKey, sortDir, page, pageSize, reloadTick]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const EXPORT_COLS = [
    { key: "sms_timestamp", label: "Date", transform: (v: string) => fmtFullDate(v) },
    { key: "device_label", label: "Caisse" },
    { key: "provider", label: "Opérateur", transform: (v: string) => PROVIDER_DISPLAY[v] ?? v },
    { key: "type", label: "Type", transform: (v: string) => TYPE_DISPLAY[v] ?? v },
    { key: "amount", label: "Montant" },
    { key: "fee", label: "Frais" },
    { key: "total", label: "Total", transform: (_v: unknown, r: AutoCapture) => rowTotal(r) },
    { key: "balance", label: "Solde" },
    { key: "reference", label: "Référence" },
    { key: "counterparty", label: "Contrepartie" },
  ];

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function resetFilters() {
    setProvider(""); setType(""); setDevice("");
    setAmountMin(""); setAmountMax(""); setSearch("");
  }

  function toggleAll() {
    if (selected.size === rows.length && rows.length > 0) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Supprimer ${selected.size} transaction(s) ? Action irréversible.`)) return;
    const supa = getSupabase();
    if (!supa) { alert("Supabase non initialisé."); return; }
    setDeleting(true);
    const ids = Array.from(selected);
    const { error: err } = await supa.from("momo_auto_capture").delete().in("id", ids);
    setDeleting(false);
    if (err) { alert(`Erreur suppression : ${err.message}`); return; }
    setSelected(new Set());
    setReloadTick((t) => t + 1);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historique</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total.toLocaleString("fr-FR")} transactions au total — page {page + 1} / {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="text-sm rounded-lg bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 disabled:opacity-50"
            >
              {deleting ? "Suppression…" : `Supprimer ${selected.size}`}
            </button>
          )}
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            className="text-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ↻ Rafraîchir
          </button>
          <ExportButton
            rows={rows}
            cols={EXPORT_COLS}
            filenamePrefix="historique"
            pdfTitle="Historique des transactions"
            pdfSubtitle={`Page ${page + 1}/${totalPages} — ${total} transaction(s)`}
          />
        </div>
      </header>

      {/* Filtres + recherche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <input
          type="text"
          placeholder="Recherche (ref, n° client, texte…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="lg:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Tous réseaux</option>
          {Object.entries(PROVIDER_DISPLAY).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Tous types</option>
          {Object.entries(TYPE_DISPLAY).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Montant min"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="Montant max"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Toutes caisses</option>
          {devices.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button
          onClick={resetFilters}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Réinitialiser
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">Erreur : {error}</div>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    aria-label="Tout sélectionner (page)"
                  />
                </th>
                <SortHeader k="sms_timestamp" label="Date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="device_label" label="Caisse" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="provider" label="Opérateur" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="type" label="Type" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="amount" label="Montant" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="fee" label="Frais" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2 text-right">Total</th>
                <SortHeader k="balance" label="Solde" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="reference" label="Référence" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="counterparty" label="Contrepartie" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {loading && (
                <tr><td colSpan={11} className="p-4 text-center text-slate-500">Chargement…</td></tr>
              )}
              {!loading && rows.map((r) => {
                const isSel = selected.has(r.id);
                const tot = rowTotal(r);
                return (
                  <tr key={r.id} className={isSel ? "bg-brand-50 dark:bg-brand-700/20" : ""}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={isSel} onChange={() => toggleOne(r.id)} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {fmtFullDate(r.sms_timestamp)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.device_label}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_COLOR[r.provider] ?? "#888" }} />
                        {PROVIDER_DISPLAY[r.provider] ?? r.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{TYPE_DISPLAY[r.type] ?? r.type}</td>
                    <td className={`px-3 py-2 text-right font-mono ${
                      r.type === "INCOMING" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : ""
                    }`}>
                      {r.amount != null ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400">
                      {r.fee && r.fee > 0 ? `−${fmtMoney(r.fee)}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${
                      tot == null ? "" : tot >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {tot == null ? "—" : `${tot >= 0 ? "+" : ""}${fmtMoney(tot)}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                      {fmtMoney(r.balance)}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[180px]" title={r.reference ?? ""}>
                      {r.reference ?? "—"}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[180px]" title={r.counterparty ?? ""}>
                      {r.counterparty ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={11} className="p-4 text-center text-slate-500">Aucun résultat.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-slate-200 dark:border-slate-700 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <span>Par page :</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              ← Précédent
            </button>
            <span className="text-slate-500">Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  k, label, align = "left", sortKey, sortDir, onClick,
}: {
  k: SortKey;
  label: string;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onClick(k)}
    >
      {label} {arrow && <span className="text-brand-500">{arrow}</span>}
    </th>
  );
}
