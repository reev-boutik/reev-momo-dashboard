import { useMemo, useState } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { fmtMoney, fmtNumber } from "../lib/format";
import { PROVIDER_DISPLAY, PROVIDER_COLOR, TYPE_DISPLAY, type AutoCapture } from "../lib/types";
import ExportButton from "../components/ExportButton";

type GroupBy = "week" | "month" | "quarter" | "year";

interface Bucket {
  key: string;        // identifiant ex. "2026-W18", "2026-04", "2026-Q2", "2026"
  label: string;      // libellé affiché ex. "Sem. 18 — 2026"
  count: number;
  in: number;
  out: number;
  bonus: number;
  fee: number;
  byProvider: Record<string, { in: number; out: number; count: number }>;
  byDevice: Record<string, { label: string; in: number; out: number; count: number }>;
}

function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

function bucketize(d: Date, by: GroupBy): { key: string; label: string } {
  const y = d.getFullYear();
  if (by === "year") {
    return { key: String(y), label: String(y) };
  }
  if (by === "month") {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const monthName = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return { key: `${y}-${m}`, label: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
  }
  if (by === "quarter") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return { key: `${y}-Q${q}`, label: `T${q} ${y}` };
  }
  // week
  const { year, week } = isoWeek(d);
  return { key: `${year}-W${String(week).padStart(2, "0")}`, label: `Sem. ${week} — ${year}` };
}

function aggregate(rows: AutoCapture[], by: GroupBy): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const d = new Date(r.sms_timestamp);
    const { key, label } = bucketize(d, by);
    let b = map.get(key);
    if (!b) {
      b = {
        key, label, count: 0, in: 0, out: 0, bonus: 0, fee: 0,
        byProvider: {}, byDevice: {},
      };
      map.set(key, b);
    }
    b.count += 1;
    if (r.amount != null) {
      if (r.type === "INCOMING") b.in += r.amount;
      else if (r.type === "OUTGOING") b.out += r.amount;
      else if (r.type === "BONUS") b.bonus += r.amount;
    }
    if (r.fee != null && r.fee > 0) b.fee += r.fee;

    // par opérateur
    const p = b.byProvider[r.provider] ?? { in: 0, out: 0, count: 0 };
    p.count += 1;
    if (r.amount != null) {
      if (r.type === "INCOMING") p.in += r.amount;
      else if (r.type === "OUTGOING") p.out += r.amount;
    }
    b.byProvider[r.provider] = p;

    // par caisse
    const dev = b.byDevice[r.device_id] ?? { label: r.device_label || r.device_id, in: 0, out: 0, count: 0 };
    dev.label = r.device_label || dev.label;
    dev.count += 1;
    if (r.amount != null) {
      if (r.type === "INCOMING") dev.in += r.amount;
      else if (r.type === "OUTGOING") dev.out += r.amount;
    }
    b.byDevice[r.device_id] = dev;
  }
  // tri DESC (plus récent en haut)
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export default function Reports() {
  const [by, setBy] = useState<GroupBy>("month");
  // Pas de filtre période ici : on charge TOUT et on agrège
  const { data, loading, error } = useCaptures({ since: null, limit: 50000 });

  const buckets = useMemo(() => aggregate(data, by), [data, by]);

  // Pour l'export, ligne par ligne
  const exportRows = useMemo(() => {
    return buckets.map((b) => ({
      periode: b.label,
      operations: b.count,
      recu: b.in,
      envoye: b.out,
      bonus: b.bonus,
      frais: b.fee,
      net: b.in - b.out + b.bonus,
      detail_operateurs: Object.entries(b.byProvider)
        .map(([p, v]) => `${PROVIDER_DISPLAY[p] ?? p}: +${fmtMoney(v.in)} / -${fmtMoney(v.out)}`)
        .join(" | "),
      detail_caisses: Object.values(b.byDevice)
        .map((d) => `${d.label}: +${fmtMoney(d.in)} / -${fmtMoney(d.out)}`)
        .join(" | "),
    }));
  }, [buckets]);

  const exportCols = [
    { key: "periode", label: "Période" },
    { key: "operations", label: "Opérations" },
    { key: "recu", label: "Reçu (F)" },
    { key: "envoye", label: "Envoyé (F)" },
    { key: "bonus", label: "Bonus (F)" },
    { key: "frais", label: "Frais (F)" },
    { key: "net", label: "Net (F)" },
    { key: "detail_operateurs", label: "Détail opérateurs" },
    { key: "detail_caisses", label: "Détail caisses" },
  ];

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  const totalIn = buckets.reduce((s, b) => s + b.in, 0);
  const totalOut = buckets.reduce((s, b) => s + b.out, 0);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rapports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cumuls par période — sans détail ligne par ligne
          </p>
        </div>
        <ExportButton
          rows={exportRows}
          cols={exportCols}
          filenamePrefix={`rapport_${by}`}
          pdfTitle={`Rapport — cumul par ${by}`}
          pdfSubtitle={`${buckets.length} période(s) · Reçu total : ${fmtMoney(totalIn)} · Envoyé total : ${fmtMoney(totalOut)}`}
        />
      </header>

      <div className="flex flex-wrap gap-1">
        {([
          ["week", "Semaine"],
          ["month", "Mois"],
          ["quarter", "Trimestre"],
          ["year", "Année"],
        ] as [GroupBy, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setBy(k)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              by === k
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {buckets.map((b) => (
          <BucketCard key={b.key} bucket={b} />
        ))}
        {buckets.length === 0 && (
          <div className="text-sm text-slate-500">Aucune donnée.</div>
        )}
      </div>
    </div>
  );
}

function BucketCard({ bucket }: { bucket: Bucket }) {
  const net = bucket.in - bucket.out + bucket.bonus;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold">{bucket.label}</h2>
        <div className="text-xs text-slate-500">{fmtNumber(bucket.count)} opération(s)</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <Mini label="Reçu" value={fmtMoney(bucket.in)} accent="text-emerald-500" />
        <Mini label="Envoyé" value={fmtMoney(bucket.out)} accent="text-rose-500" />
        <Mini label="Bonus" value={fmtMoney(bucket.bonus)} accent="text-blue-500" />
        <Mini label="Frais" value={fmtMoney(bucket.fee)} accent="text-amber-500" />
        <Mini
          label="Net"
          value={fmtMoney(net)}
          accent={net >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Par opérateur</h3>
          <div className="space-y-1">
            {Object.entries(bucket.byProvider)
              .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
              .map(([p, v]) => (
                <div key={p} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER_COLOR[p] ?? "#888" }} />
                    {PROVIDER_DISPLAY[p] ?? p}
                  </span>
                  <span className="font-mono text-xs">
                    <span className="text-emerald-500">+{fmtMoney(v.in)}</span>
                    {"  "}
                    <span className="text-rose-500">−{fmtMoney(v.out)}</span>
                    {"  "}
                    <span className="text-slate-400">({v.count})</span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Par caisse</h3>
          <div className="space-y-1">
            {Object.values(bucket.byDevice)
              .sort((a, b) => (b.in + b.out) - (a.in + a.out))
              .map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="truncate">{d.label}</span>
                  <span className="font-mono text-xs flex-none ml-2">
                    <span className="text-emerald-500">+{fmtMoney(d.in)}</span>
                    {"  "}
                    <span className="text-rose-500">−{fmtMoney(d.out)}</span>
                    {"  "}
                    <span className="text-slate-400">({d.count})</span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-semibold font-mono ${accent}`}>{value}</div>
    </div>
  );
}
