import { useMemo, useState } from "react";

export type PeriodKey = "today" | "week" | "month" | "year" | "all" | "custom";

export interface PeriodRange {
  key: PeriodKey;
  since: string | null; // ISO ou null pour "all"
  until: string | null;
  label: string;
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
 * Calcule la borne basse (since) et haute (until) en fonction du choix.
 * - today  : 00:00 aujourd'hui jusqu'à maintenant
 * - week   : 00:00 lundi de cette semaine jusqu'à maintenant
 * - month  : 1er du mois courant 00:00 jusqu'à maintenant
 * - year   : 1er janvier de l'année courante 00:00 jusqu'à maintenant
 * - all    : pas de borne
 * - custom : valeurs explicites
 */
export function buildRange(key: PeriodKey, customSince?: string, customUntil?: string): PeriodRange {
  const now = new Date();
  switch (key) {
    case "today": {
      const s = startOf(now);
      return { key, since: isoOrNull(s), until: null, label: "Aujourd'hui" };
    }
    case "week": {
      const s = startOf(now);
      // Lundi = jour 1, dimanche = jour 0 → décale pour avoir lundi
      const dow = s.getDay();
      const offset = dow === 0 ? 6 : dow - 1;
      s.setDate(s.getDate() - offset);
      return { key, since: isoOrNull(s), until: null, label: "Cette semaine" };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { key, since: isoOrNull(s), until: null, label: "Ce mois" };
    }
    case "year": {
      const s = new Date(now.getFullYear(), 0, 1);
      return { key, since: isoOrNull(s), until: null, label: "Cette année" };
    }
    case "custom":
      return {
        key,
        since: customSince ?? null,
        until: customUntil ?? null,
        label: "Personnalisé",
      };
    case "all":
    default:
      return { key: "all", since: null, until: null, label: "Tout" };
  }
}

export function usePeriod(initial: PeriodKey = "today") {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [customSince, setCustomSince] = useState<string>("");
  const [customUntil, setCustomUntil] = useState<string>("");

  const range = useMemo(
    () => buildRange(key, customSince || undefined, customUntil || undefined),
    [key, customSince, customUntil]
  );

  return {
    key,
    setKey,
    range,
    customSince,
    setCustomSince,
    customUntil,
    setCustomUntil,
  };
}
