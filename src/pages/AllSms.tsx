import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";
import ExportButton from "../components/ExportButton";
import { fmtMoney, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

type SmsCategory = "TRANSACTION" | "PROMO" | "OTP" | "OTHER";

const CATEGORY_DISPLAY: Record<SmsCategory, string> = {
  TRANSACTION: "💸 Transaction",
  PROMO: "📢 Pub",
  OTP: "🔐 OTP",
  OTHER: "📩 Autre",
};

const CATEGORY_COLOR: Record<SmsCategory, string> = {
  TRANSACTION: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  PROMO: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  OTP: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  OTHER: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
};

/** Devine la catégorie du SMS à partir du raw_text et des champs parsés. */
function categorize(c: AutoCapture): SmsCategory {
  const text = (c.raw_text || "").toLowerCase();
  const hasTx =
    c.amount != null && (c.type === "INCOMING" || c.type === "OUTGOING" || c.type === "BONUS");
  if (hasTx) return "TRANSACTION";

  const otpKeywords = ["otp", "code de", "code:", "verification", "verif ", "token", "code valide", "code secret", "your code"];
  const hasOtpWord = otpKeywords.some((k) => text.includes(k));
  const hasShortNumber = /\b\d{4,8}\b/.test(text);
  if (hasOtpWord && hasShortNumber) return "OTP";

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

/**
 * Extrait un numéro de téléphone du SMS, quand il est présent.
 * Priorité : contrepartie déjà parsée, puis numéro masqué Wave (05******97),
 * puis numéro ivoirien 10 chiffres (07/05/01…) éventuellement préfixé 225.
 */
function extractPhone(c: AutoCapture): string | null {
  const sources = [c.counterparty || "", c.raw_text || ""];
  for (const s of sources) {
    const masked = s.match(/\d{1,4}\*+\d{1,4}/);
    if (masked) return masked[0];
    const ci = s.match(/\b(?:225)?0\d{9}\b/);
    if (ci) return ci[0];
  }
  return null;
}

type SortKey = "sms_timestamp" | "device_label" | "provider" | "amount" | "type";
type SortDir = "asc" | "desc";

const PAGE_SIZES: Array<number | "all"> = [5, 10, 25, 50, 100, "all"];

export default function AllSms() {
  const [provider, setProvider] = useState<string>("");
  const [device, setDevice] = useState<string>("");
  const [typeF, setTypeF] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("sms_timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number | "all">(50);

  const [rows, setRows] = useState<AutoCapture[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [devices, setDevices] = useState<Array<[string, string]>>([]);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // Debounce de la recherche (évite une requête par frappe)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Retour page 1 quand un filtre change
  useEffect(() => {
    setPage(0);
  }, [provider, device, typeF, amountMin, amountMax, debouncedSearch, sortKey, sortDir, pageSize]);

  // Liste des caisses (dédupliquée sur les 1000 dernières lignes)
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

  // Chargement paginé serveur (ou tout, si pageSize = "all")
  useEffect(() => {
    const supa = getSupabase();
    if (!supa) { setError("Configuration Supabase manquante"); setLoading(false); return; }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withFilters = (qb: any) => {
      let q = qb.order(sortKey, { ascending: sortDir === "asc" });
      if (provider) q = q.eq("provider", provider);
      if (device) q = q.eq("device_id", device);
      if (typeF) q = q.eq("type", typeF);
      if (amountMin !== "" && Number.isFinite(Number(amountMin))) q = q.gte("amount", Number(amountMin));
      if (amountMax !== "" && Number.isFinite(Number(amountMax))) q = q.lte("amount", Number(amountMax));
      const s = debouncedSearch.replace(/[,()]/g, " ").trim();
      if (s) {
        q = q.or(
          `raw_text.ilike.%${s}%,counterparty.ilike.%${s}%,reference.ilike.%${s}%,device_label.ilike.%${s}%,title.ilike.%${s}%`
        );
      }
      return q;
    };
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (pageSize === "all") {
          const PAGE = 1000;
          const acc: AutoCapture[] = [];
          for (let from = 0; ; from += PAGE) {
            const { data, error: err } = await withFilters(
              supa.from("momo_auto_capture").select("*")
            ).range(from, from + PAGE - 1);
            if (err) throw err;
            const batch = (data ?? []) as AutoCapture[];
            acc.push(...batch);
            if (batch.length < PAGE) break;
          }
          if (cancelled) return;
          setRows(acc);
          setTotal(acc.length);
        } else {
          const from = page * pageSize;
          const { data, count, error: err } = await withFilters(
            supa.from("momo_auto_capture").select("*", { count: "exact" })
          ).range(from, from + pageSize - 1);
          if (cancelled) return;
          if (err) throw err;
          setRows((data ?? []) as AutoCapture[]);
          setTotal(count ?? 0);
        }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setRows([]); setTotal(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [provider, device, typeF, amountMin, amountMax, debouncedSearch, sortKey, sortDir, page, pageSize, reloadTick]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(total / pageSize));

  const enriched = useMemo(
    () => rows.map((c) => ({ row: c, category: categorize(c), phone: extractPhone(c) })),
    [rows]
  );

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function resetFilters() {
    setProvider(""); setDevice(""); setTypeF("");
    setAmountMin(""); setAmountMax(""); setSearch("");
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tous les SMS</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total.toLocaleString("fr-FR")} SMS au total — page {page + 1} / {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            className="text-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ↻ Rafraîchir
          </button>
          <ExportButton
            rows={rows}
            cols={[
              { key: "sms_timestamp", label: "Date", transform: (v: string) => fmtFullDate(v) },
              { key: "device_label", label: "Caisse" },
              { key: "provider", label: "Opérateur", transform: (v: string) => PROVIDER_DISPLAY[v] ?? v },
              { key: "type", label: "Type", transform: (v: string) => TYPE_DISPLAY[v] ?? v },
              { key: "counterparty", label: "Téléphone", transform: (_v: unknown, r: AutoCapture) => extractPhone(r) ?? "" },
              { key: "amount", label: "Montant" },
              { key: "reference", label: "Référence" },
              { key: "raw_text", label: "Texte brut" },
            ]}
            filenamePrefix="tous_sms"
            pdfTitle="Tous les SMS"
            pdfSubtitle={`Page ${page + 1}/${totalPages} — ${total} SMS`}
          />
        </div>
      </header>

      {/* Filtres + recherche */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <input
          type="text"
          placeholder="Recherche (texte, n°, réf…)"
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
          value={typeF}
          onChange={(e) => setTypeF(e.target.value)}
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
                <SortHeader k="sms_timestamp" label="Date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="device_label" label="Caisse" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHeader k="provider" label="Opérateur" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Téléphone</th>
                <SortHeader k="amount" label="Montant" align="right" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2">Aperçu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading && (
                <tr><td colSpan={7} className="p-4 text-center text-slate-500">Chargement…</td></tr>
              )}
              {!loading && enriched.map(({ row: r, category, phone }) => (
                <RowFragment
                  key={r.id}
                  r={r}
                  category={category}
                  phone={phone}
                  open={openId === r.id}
                  onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                />
              ))}
              {!loading && enriched.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-slate-500">Aucun SMS.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-slate-200 dark:border-slate-700 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <span>Par page :</span>
            <select
              value={pageSize === "all" ? "all" : String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : Number(v));
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
            >
              {PAGE_SIZES.map((n) => (
                <option key={String(n)} value={n === "all" ? "all" : String(n)}>
                  {n === "all" ? "Tout" : n}
                </option>
              ))}
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

function RowFragment({
  r, category, phone, open, onToggle,
}: {
  r: AutoCapture;
  category: SmsCategory;
  phone: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
        onClick={onToggle}
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
          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${CATEGORY_COLOR[category]}`}>
            {CATEGORY_DISPLAY[category]}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
          {phone ?? "—"}
        </td>
        <td className={`px-3 py-2 text-right font-mono ${
          r.type === "INCOMING" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : ""
        }`}>
          {r.amount != null ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}` : "—"}
        </td>
        <td className="px-3 py-2 truncate max-w-[360px] text-slate-600 dark:text-slate-300">
          {r.raw_text?.slice(0, 120) ?? r.title ?? "—"}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50 dark:bg-slate-900/40">
          <td colSpan={7} className="px-3 py-3">
            <div className="space-y-2 text-sm">
              {r.title && (
                <div><span className="text-slate-500">Titre :</span> <strong>{r.title}</strong></div>
              )}
              <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono text-xs bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 select-text">
                {r.raw_text}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {phone && <span>Téléphone : {phone}</span>}
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
