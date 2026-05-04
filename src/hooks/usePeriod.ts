import { useMemo, useState } from "react";

export type PeriodUnit = "day" | "week" | "month" | "year";
export type PeriodKey = PeriodUnit | "all" | "custom";

export interface PeriodRange {
  key: PeriodKey;
  since: string | null;
  until: string | null;
  label: string;
  /** Nombre d'unités, utile pour "10 derniers jours" */
  count?: number;
}

function startOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Calcule la borne basse (since) en fonction du choix.
 * - day(N)   : commence il y a N jours (00:00) — par défaut N=1 = aujourd'hui
 * - week(N)  : commence il y a N semaines (lundi 00:00) — par défaut N=1 = cette semaine
 * - month(N) : commence il y a N mois (1er du mois 00:00) — par défaut N=1 = ce mois
 * - year(N)  : commence il y a N années (1er janv 00:00) — par défaut N=1 = cette année
 * - all      : pas de borne basse
 * - custom   : valeurs explicites
 *
 * Pas de borne haute : on prend toujours jusqu'à maintenant.
 */
export function buildRange(
  key: PeriodKey,
  count: number = 1,
  customSince?: string,
  customUntil?: string
): PeriodRange {
  const now = new Date();
  const n = Math.max(1, count);

  if (key === "all") {
    return { key: "all", since: null, until: null, label: "Tout" };
  }

  if (key === "custom") {
    return {
      key,
      since: customSince ?? null,
      until: customUntil ?? null,
      label: "Personnalisé",
    };
  }

  if (key === "day") {
    const s = startOf(now);
    s.setDate(s.getDate() - (n - 1));
    const label = n === 1 ? "Aujourd'hui" : `${n} derniers jours`;
    return { key, count: n, since: isoOrNull(s), until: null, label };
  }

  if (key === "week") {
    const s = startOf(now);
    const dow = s.getDay();
    const offset = dow === 0 ? 6 : dow - 1; // lundi
    s.setDate(s.getDate() - offset - (n - 1) * 7);
    const label = n === 1 ? "Cette semaine" : `${n} dernières semaines`;
    return { key, count: n, since: isoOrNull(s), until: null, label };
  }

  if (key === "month") {
    const s = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
    const label = n === 1 ? "Ce mois" : `${n} derniers mois`;
    return { key, count: n, since: isoOrNull(s), until: null, label };
  }

  if (key === "year") {
    const s = new Date(now.getFullYear() - (n - 1), 0, 1);
    const label = n === 1 ? "Cette année" : `${n} dernières années`;
    return { key, count: n, since: isoOrNull(s), until: null, label };
  }

  return { key: "all", since: null, until: null, label: "Tout" };
}

export function usePeriod(initialKey: PeriodKey = "day", initialCount: number = 1) {
  const [key, setKey] = useState<PeriodKey>(initialKey);
  const [count, setCount] = useState<number>(initialCount);
  const [customSince, setCustomSince] = useState<string>("");
  const [customUntil, setCustomUntil] = useState<string>("");

  const range = useMemo(
    () => buildRange(key, count, customSince || undefined, customUntil || undefined),
    [key, count, customSince, customUntil]
  );

  return {
    key,
    setKey: (k: PeriodKey) => {
      setKey(k);
      // Reset count à 1 quand on change de preset (sauf si on reste sur le même)
      if (k !== key) setCount(1);
    },
    count,
    setCount,
    range,
    customSince,
    setCustomSince,
    customUntil,
    setCustomUntil,
  };
}
