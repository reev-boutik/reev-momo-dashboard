import { useEffect, useMemo, useState } from "react";
import { useCaptures } from "../hooks/useCaptures";
import { usePeriod } from "../hooks/usePeriod";
import PeriodFilter from "../components/PeriodFilter";
import ExportButton from "../components/ExportButton";
import { fmtMoney, fmtTime, fmtDate, fmtFullDate } from "../lib/format";
import {
  PROVIDER_DISPLAY,
  PROVIDER_COLOR,
  TYPE_DISPLAY,
  type AutoCapture,
} from "../lib/types";

interface ChainedRow extends AutoCapture {
  prevBalance: number | null;
  expectedBalance: number | null;
  delta: number | null;
}

/**
 * Chaîne les soldes. Écart = solde réel SMS − solde calculé (précédent + montant
 * signé − frais). +écart = surplus, −écart = manque.
 *
 * `mergeAccount` : si vrai, on chaîne par OPÉRATEUR uniquement (on ignore le
 * device). Sert au compte « Orange Money + Bonus » : les transactions Orange
 * Money (téléphone money) et les bonus de volume (téléphone bonus dédié) portent
 * le même `provider` ORANGE_MONEY et appartiennent au MÊME compte réel, donc ils
 * doivent former une seule chaîne même s'ils viennent de deux téléphones.
 *
 * Les lignes sans solde réel (bonus, balance=null) font avancer la chaîne via le
 * solde calculé, pour ne pas créer de faux écart sur la transaction suivante.
 */
function buildChain(rows: AutoCapture[], mergeAccount = false): ChainedRow[] {
  const sorted = [...rows].sort((a, b) =>
    a.sms_timestamp.localeCompare(b.sms_timestamp)
  );
  const out: ChainedRow[] = [];
  const lastBalance = new Map<string, number | null>();

  for (const r of sorted) {
    const key = mergeAccount ? r.provider : `${r.device_id}|${r.provider}`;
    const prev = lastBalance.has(key) ? lastBalance.get(key)! : null;

    let signed: number | null = null;
    if (r.amount != null) {
      if (r.type === "INCOMING" || r.type === "BONUS") signed = r.amount;
      else if (r.type === "OUTGOING") signed = -r.amount;
    }
    const fee = r.fee ?? 0;
    const expected = prev != null && signed != null ? prev + signed - fee : null;
    const delta = expected != null && r.balance != null ? r.balance - expected : null;

    out.push({ ...r, prevBalance: prev, expectedBalance: expected, delta });

    if (r.balance != null) lastBalance.set(key, r.balance);
    else if (expected != null) lastBalance.set(key, expected); // traverse les bonus
  }
  return out.reverse();
}

type Mode = "device" | "orange";

export default function Reconciliation() {
  const period = usePeriod("day");
  const { data, loading, error } = useCaptures({
    since: period.range.since,
    until: period.range.until,
    limit: 1_000_000,
    realtime: false,
  });

  const [mode, setMode] = useState<Mode>("device");
  const [device, setDevice] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [moneyDevice, setMoneyDevice] = useState<string>("");
  const [bonusDevice, setBonusDevice] = useState<string>("");
  const [onlyDelta, setOnlyDelta] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [openId, setOpenId] = useState<number | null>(null);

  const devices = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of data) set.set(r.device_id, r.device_label || r.device_id);
    return Array.from(set.entries());
  }, [data]);

  // Détection auto : téléphone qui a le plus de transactions Orange Money
  // (hors bonus) = money ; téléphone qui a le plus de bonus = bonus.
  const orangeGuess = useMemo(() => {
    const money = new Map<string, number>();
    const bonus = new Map<string, number>();
    for (const r of data) {
      if (r.provider !== "ORANGE_MONEY") continue;
      if (r.type === "BONUS") bonus.set(r.device_id, (bonus.get(r.device_id) ?? 0) + 1);
      else money.set(r.device_id, (money.get(r.device_id) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return { money: top(money), bonus: top(bonus) };
  }, [data]);

  // Pré-remplit les deux téléphones la première fois
  useEffect(() => {
    if (!moneyDevice && orangeGuess.money) setMoneyDevice(orangeGuess.money);
    if (!bonusDevice && orangeGuess.bonus) setBonusDevice(orangeGuess.bonus);
  }, [orangeGuess, moneyDevice, bonusDevice]);

  // Jeu de lignes selon le mode
  const sourceRows = useMemo(() => {
    if (mode !== "orange") return data;
    return data.filter(
      (r) =>
        (r.device_id === moneyDevice && r.provider === "ORANGE_MONEY" && r.type !== "BONUS") ||
        (r.device_id === bonusDevice && r.type === "BONUS")
    );
  }, [data, mode, moneyDevice, bonusDevice]);

  const chained = useMemo(
    () => buildChain(sourceRows, mode === "orange"),
    [sourceRows, mode]
  );

  const filtered = useMemo(
    () =>
      chained.filter((r) => {
        if (mode === "device") {
          if (device && r.device_id !== device) return false;
          if (provider && r.provider !== provider) return false;
        }
        if (onlyDelta && (r.delta == null || Math.abs(r.delta) < 0.5)) return false;
        const s = search.trim().toLowerCase();
        if (s) {
          const hay = `${r.raw_text ?? ""} ${r.counterparty ?? ""} ${r.reference ?? ""} ${r.device_label ?? ""}`.toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      }),
    [chained, mode, device, provider, onlyDelta, search]
  );

  const totalDelta = filtered.reduce((s, r) => (r.delta != null ? s + r.delta : s), 0);
  const countWithDelta = filtered.filter(
    (r) => r.delta != null && Math.abs(r.delta) >= 0.5
  ).length;
  const bonusRows = filtered.filter((r) => r.type === "BONUS" && r.amount != null);
  const totalBonus = bonusRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  if (loading) return <div className="p-6 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">Erreur : {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Réconciliation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Chaînage des soldes — {period.range.label}.
            Écart = solde réel SMS − solde calculé (précédent + montant − frais).
          </p>
        </div>
        <ExportButton
          rows={filtered}
          cols={[
            { key: "sms_timestamp", label: "Date", transform: (v: string) => fmtFullDate(v) },
            { key: "device_label", label: "Caisse" },
            { key: "provider", label: "Opérateur", transform: (v: string) => PROVIDER_DISPLAY[v] ?? v },
            { key: "type", label: "Type", transform: (v: string) => TYPE_DISPLAY[v] ?? v },
            { key: "amount", label: "Montant" },
            { key: "fee", label: "Frais" },
            { key: "prevBalance", label: "Solde précédent" },
            { key: "expectedBalance", label: "Solde calculé" },
            { key: "balance", label: "Solde réel" },
            { key: "delta", label: "Écart (réel − calculé)" },
          ]}
          filenamePrefix="reconciliation"
          pdfTitle="Réconciliation des soldes"
          pdfSubtitle={`${filtered.length} ligne(s) — ${period.range.label} — ${countWithDelta} écart(s) — total : ${fmtMoney(totalDelta)}`}
        />
      </header>

      <PeriodFilter
        value={period.key}
        onChange={period.setKey}
        count={period.count}
        onCountChange={period.setCount}
        customSince={period.customSince}
        customUntil={period.customUntil}
        onCustomSince={period.setCustomSince}
        onCustomUntil={period.setCustomUntil}
      />

      {/* Choix du mode */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setMode("device")}
          className={`text-sm rounded-lg px-3 py-1.5 border ${
            mode === "device"
              ? "bg-slate-700 border-slate-700 text-white"
              : "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          Par caisse
        </button>
        <button
          onClick={() => setMode("orange")}
          className={`text-sm rounded-lg px-3 py-1.5 border ${
            mode === "orange"
              ? "bg-orange-500 border-orange-500 text-white"
              : "border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
          }`}
        >
          Compte Orange Money + Bonus
        </button>
      </div>

      {mode === "device" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={device} onChange={(e) => setDevice(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <option value="">Toutes caisses</option>
            {devices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
            <option value="">Tous opérateurs</option>
            {Object.entries(PROVIDER_DISPLAY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={onlyDelta} onChange={(e) => setOnlyDelta(e.target.checked)} />
            Uniquement les écarts
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-slate-500 mb-1">Téléphone Orange Money (transactions, hors Wave)</span>
              <select value={moneyDevice} onChange={(e) => setMoneyDevice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <option value="">— choisir —</option>
                {devices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-slate-500 mb-1">Téléphone Bonus (commissions de volume)</span>
              <select value={bonusDevice} onChange={(e) => setBonusDevice(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                <option value="">— choisir —</option>
                {devices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:self-end sm:pb-2">
              <input type="checkbox" checked={onlyDelta} onChange={(e) => setOnlyDelta(e.target.checked)} />
              Uniquement les écarts
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Combine les transactions Orange Money du premier téléphone (Wave exclu) et les bonus du second, en une seule chaîne de compte.
          </p>
        </div>
      )}

      <input
        type="text"
        placeholder="Rechercher dans le texte des SMS (n°, réf, mot-clé…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <KpiCard title="Lignes affichées" value={filtered.length.toLocaleString("fr-FR")} accent="text-slate-700 dark:text-slate-200" />
        <KpiCard title="Bonus reçus" value={`${fmtMoney(totalBonus)} (${bonusRows.length})`} accent="text-amber-500" />
        <KpiCard title="Avec écart" value={countWithDelta.toString()}
          accent={countWithDelta > 0 ? "text-amber-500" : "text-emerald-500"} />
        <KpiCard title="Somme des écarts" value={fmtMoney(totalDelta)}
          accent={Math.abs(totalDelta) < 0.5 ? "text-emerald-500" : totalDelta > 0 ? "text-amber-500" : "text-rose-500"} />
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
              <th className="px-3 py-2 text-right">Frais</th>
              <th className="px-3 py-2 text-right">Solde précédent</th>
              <th className="px-3 py-2 text-right">Solde calculé</th>
              <th className="px-3 py-2 text-right">Solde réel</th>
              <th className="px-3 py-2 text-right">Écart</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {filtered.map((r) => {
              const hasDelta = r.delta != null && Math.abs(r.delta) >= 0.5;
              const isBonus = r.type === "BONUS";
              return [
                <tr
                  key={r.id}
                  className={
                    hasDelta
                      ? "bg-rose-50 dark:bg-rose-900/20"
                      : isBonus
                      ? "bg-amber-50 dark:bg-amber-900/20"
                      : ""
                  }
                >
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {fmtDate(r.sms_timestamp)} {fmtTime(r.sms_timestamp)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.device_label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: PROVIDER_COLOR[r.provider] ?? "#888" }} />
                      {PROVIDER_DISPLAY[r.provider] ?? r.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isBonus && <span className="mr-1">🎁</span>}
                    {TYPE_DISPLAY[r.type] ?? r.type}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    r.type === "INCOMING" || r.type === "BONUS" ? "text-emerald-500" : r.type === "OUTGOING" ? "text-rose-500" : ""
                  }`}>
                    {r.amount != null ? `${r.type === "OUTGOING" ? "−" : "+"}${fmtMoney(r.amount)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {r.fee && r.fee > 0 ? `−${fmtMoney(r.fee)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtMoney(r.prevBalance)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtMoney(r.expectedBalance)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">{fmtMoney(r.balance)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    hasDelta ? (r.delta! > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-rose-600 dark:text-rose-400 font-semibold") : "text-slate-400"
                  }`}>
                    {r.delta != null ? `${r.delta > 0 ? "+" : ""}${fmtMoney(r.delta)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      className="text-xs rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {openId === r.id ? "Masquer" : "SMS"}
                    </button>
                  </td>
                </tr>,
                openId === r.id ? (
                  <tr key={`${r.id}-sms`} className="bg-slate-50 dark:bg-slate-900/40">
                    <td colSpan={11} className="px-3 py-3">
                      <div className="space-y-2 text-sm">
                        {r.title && (
                          <div><span className="text-slate-500">Titre :</span> <strong>{r.title}</strong></div>
                        )}
                        <div className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono text-xs bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 select-text">
                          {r.raw_text ?? "—"}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          {r.reference && <span>Réf : {r.reference}</span>}
                          {r.counterparty && <span>Contrepartie : {r.counterparty}</span>}
                          {r.package_name && <span>App : {r.package_name}</span>}
                          <span>{fmtFullDate(r.sms_timestamp)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            }).flat().filter(Boolean)}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-4 text-center text-slate-500">Aucune ligne.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
