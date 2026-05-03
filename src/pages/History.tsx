import { useMemo, useState } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { fmtMoney, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

export default function History() {
  const { data, loading, error } = useCaptures({ limit: 5000 });
  const [provider, setProvider] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [device, setDevice] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const devices = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data) set.set(r.device_id, r.device_label || r.device_id);
    return Array.from(set.entries());
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (provider && r.provider !== provider) return false;
      if (type && r.type !== type) return false;
      if (device && r.device_id !== device) return false;
      if (q) {
        const hay = [
          r.raw_text,
          r.reference,
          r.counterparty,
          r.device_label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, provider, type, device, search]);

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Historique</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} sur {data.length} transactions
          </p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Export CSV
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Recherche (ref, n° client, texte…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Tous opérateurs</option>
          {Object.entries(PROVIDER_DISPLAY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Tous types</option>
          {Object.entries(TYPE_DISPLAY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Toutes caisses</option>
          {devices.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Caisse</th>
              <th className="px-3 py-2">Opérateur</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2 text-right">Solde</th>
              <th className="px-3 py-2">Référence</th>
              <th className="px-3 py-2">Contrepartie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {filtered.slice(0, 500).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {fmtFullDate(r.sms_timestamp)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.device_label}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: PROVIDER_COLOR[r.provider] ?? "#888" }}
                    />
                    {PROVIDER_DISPLAY[r.provider] ?? r.provider}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{TYPE_DISPLAY[r.type] ?? r.type}</td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    r.type === "INCOMING"
                      ? "text-emerald-500"
                      : r.type === "OUTGOING"
                      ? "text-rose-500"
                      : ""
                  }`}
                >
                  {r.amount != null
                    ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}`
                    : "—"}
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-slate-500">
                  Aucun résultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-slate-500 text-center">
            500 premiers résultats affichés. Affine les filtres ou exporte.
          </div>
        )}
      </div>
    </div>
  );
}

function exportCsv(rows: AutoCapture[]) {
  const cols = [
    "sms_timestamp",
    "device_label",
    "provider",
    "type",
    "amount",
    "balance",
    "fee",
    "bonus",
    "reference",
    "counterparty",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          const v = (r as any)[c];
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return s.includes(",") || s.includes('"') ? `"${s}"` : s;
        })
        .join(",")
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reev_momo_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
