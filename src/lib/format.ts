/** Formats numériques et de date utilisés dans tout le dashboard. */

const NF = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${NF.format(n)} F`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return NF.format(n);
}

const TIME = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

const FULL = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function fmtTime(iso: string): string {
  return TIME.format(new Date(iso));
}

export function fmtFullDate(iso: string): string {
  return FULL.format(new Date(iso));
}

export function fmtDate(iso: string): string {
  return DATE_ONLY.format(new Date(iso));
}

export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
