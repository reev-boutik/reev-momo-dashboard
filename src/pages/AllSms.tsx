import { useMemo, useState } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import ExportButton from "../components/ExportButton";
import { fmtMoney, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

type Category = "TRANSACTION" | "PROMO" | "OTP" | "OTHER";

const CATEGORY_DISPLAY: Record<Category, string> = {
  TRANSACTION: "💸 Transaction",
  PROMO: "📢 Pub",
  OTP: "🔐 OTP",
  OTHER: "📩 Autre",
};

const CATEGORY_COLOR: Record<Category, string> = {
  TRANSACTION: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  PROMO: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  OTP: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  OTHER: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

/**
 * Devine la catégorie du SMS à partir du raw_text et des champs parsés.
 * Heuristiques :
 *  - TRANSACTION : amount présent et type ∈ INCOMING/OUTGOING/BONUS
 *  - OTP : présence de mots-clés "code", "OTP", "verification", "token" + nombre court (4-8 chiffres)
 *  - PROMO : mots-clés promotionnels (offre, gagne, cadeau, *123#, abonnement, forfait...)
 *  - OTHER : tout le reste
 */
function categorize(c: AutoCapture): Category {
  const text = (c.raw_text || "").toLowerCase();
  const hasTx =
    c.amount != null && (c.type === "INCOMING" || c.type === "OUTGOING" || c.type === "BONUS");
  if (hasTx) return "TRANSACTION";

  // OTP detection
  const otpKeywords = ["otp", "code de", "code:", "verification", "verif ", "token", "code valide", "code secret", "your code"];
  const hasOtpWord = otpKeywords.some((k) => text.includes(k));
  const hasShortNumber = /\b\d{4,8}\b/.test(text);
  if (hasOtpWord && hasShortNumber) return "OTP";

  // Promo detection
  const promoKeywords = [
    "offre", "promo", "gagne", "gagnez", "cadeau", "abonnement", "abonnez",
    "forfait", "pass internet", "data", "bonus de", "tirage", "loterie",
    "nouveau service", "decouvrez", "découvrez", "*123#", "*155#", "*144#",
    "souscrire", "rejoignez", "felicitations", "félicitations",
    "win ", "sweepstake", "subscribe", "click here",
  ];
  if (promoKeywords.some((k) => text.includes(k))) return "PROMO";

  return "OTHER";
}

type SortKey = "sms_timestamp" | "device_label" | "provider" | "category" | "amount";
type SortDir = "asc" | "desc";

export default function AllSms() {
  const period = usePeriod("today");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 5000,
  });

  const [provider, setProvider] = useState<string>("");
  const [device, setDevice] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("sms_timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<number | null>(null);

  const enriched = useMemo(
    () => data.map((c) => ({ ...c, category: categorize(c) as Category })),
    [data]
  );

  const devices = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data) set.set(r.device_id, r.device_label || r.device_id);
    return Array.from(set.entries());
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let res = enriched.filter((r) => {
      if (provider && r.provider !== provider) return false;
      if (device && r.device_id !== device) return false;
      if (category && r.category !== category) return false;
      if (q) {
        const hay = [r.raw_text, r.title, r.reference, r.counterparty, r.device_label]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    res = [...res].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return res;
  }, [enriched, provider, device, category, search, sortKey, sortDir]);

  // Stats par catégorie
  const stats = useMemo(() => {
    const counts: Record<string, number> = { TRANSACTION: 0, PROMO: 0, OTP: 0, OTHER: 0 };
    for (const r of enriched) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [enriched]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tous les SMS</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} sur {data.length} SMS — {period.range.label}
          </p>
        </div>
        <ExportButton
          rows={filtered}
          cols={[
            { key: "sms_timestamp", label: "Date", transform: (v: string) => fmtFullDate(v) },
            { key: "device_label", label: "Caisse" },
            { key: "provider", label: "Opérateur", transform: (v: string) => PROVIDER_DISPLAY[v] ?? v },
            { key: "category", label: "Catégorie", transform: (v: string) => CATEGORY_DISPLAY[v as Category] ?? v },
            { key: "type", label: "Type", transform: (v: string) => TYPE_DISPLAY[v] ?? v },
            { key: "amount", label: "Montant" },
            { key: "title", label: "Titre" },
            { key: "raw_text", label: "Texte brut" },
          ]}
          filenamePrefix="tous_sms"
          pdfTitle="Tous les SMS"
          pdfSubtitle={`${filtered.length} SMS — ${period.range.label}`}
        />
      </header>

      <PeriodFilter
        value={period.key}
        onChange={period.setKey}
        customSince={period.customSince}
        customUntil={period.customUntil}
        onCustomSince={period.setCustomSince}
        onCustomUntil={period.setCustomUntil}
      />

      {/* Compteurs catégories cliquables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(CATEGORY_DISPLAY) as Category[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(category === cat ? "" : cat)}
            className={`rounded-2xl border p-3 text-left transition ${
              category === cat
                ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {CATEGORY_DISPLAY[cat]}
            </div>
            <div className="text-2xl font-semibold mt-1">{stats[cat] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Recherche dans le texte…"
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
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Toutes catégories</option>
          {(Object.keys(CATEGORY_DISPLAY) as Category[]).map((k) => (
            <option key={k} value={k}>{CATEGORY_DISPLAY[k]}</option>
          ))}
        </select>
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
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <SortHeader k="sms_timestamp" label="Date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="device_label" label="Caisse" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="provider" label="Opérateur" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="category" label="Catégorie" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="amount" label="Montant" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2">Aperçu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.slice(0, 500).map((r) => (
                <>
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
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
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLOR[r.category]}`}>
                        {CATEGORY_DISPLAY[r.category]}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${
                      r.type === "INCOMING" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : ""
                    }`}>
                      {r.amount != null ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}` : "—"}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[400px] text-slate-600 dark:text-slate-300">
                      {r.raw_text?.slice(0, 120) ?? r.title ?? "—"}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr className="bg-slate-50 dark:bg-slate-900/40">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="space-y-2 text-sm">
                          {r.title && (
                            <div><span className="text-slate-500">Titre :</span> <strong>{r.title}</strong></div>
                          )}
                          <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono text-xs bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 select-text">
                            {r.raw_text}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            {r.reference && <span>Réf : {r.reference}</span>}
                            {r.counterparty && <span>Contrepartie : {r.counterparty}</span>}
                            {r.balance != null && <span>Solde : {fmtMoney(r.balance)}</span>}
                            {r.fee != null && r.fee > 0 && <span>Frais : {fmtMoney(r.fee)}</span>}
                            {r.package_name && <span>App : {r.package_name}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">Aucun SMS.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-slate-500 text-center border-t border-slate-200 dark:border-slate-700">
            500 premiers résultats affichés. Affine les filtres ou exporte.
          </div>
        )}
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
