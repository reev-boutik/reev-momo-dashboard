/**
 * Parser JS pour notifications/SMS Mobile Money.
 * Porté depuis l'app Android Kotlin (MomoParser.kt).
 * Utilisé côté dashboard pour re-analyser des transactions existantes en base
 * (extraire counterparty, fee, etc.) sans devoir les capter à nouveau côté Android.
 *
 * IMPORTANT : ce parser doit rester synchronisé avec le Kotlin. Si tu améliores
 * le Kotlin, porte les changements ici aussi.
 */

export interface ParsedFields {
  type?: string;
  amount?: number | null;
  balance?: number | null;
  fee?: number | null;
  bonus?: number | null;
  reference?: string | null;
  counterparty?: string | null;
}

const NUMBER = "[0-9]+(?:[ .,][0-9]{3})*(?:[.,][0-9]{1,2})?";
const CURRENCY = "(?:F\\s*CFA|FCFA|XOF|CFA|F\\b)";

const INCOMING_KEYWORDS = [
  "vous avez reçu", "vous avez recu", "received from",
  "credit de", "crédit de", "depot de", "dépôt de", "deposit of",
  "transfert reçu", "transfert recu", "paid you", "payment received",
  "no fee on your payment", " reçu ", " recu ", " received ", " credited "
];

const OUTGOING_KEYWORDS = [
  "vous avez envoye", "vous avez envoyé", "vous avez paye", "vous avez payé",
  "transfert effectue", "transfert effectué", "you have sent", "sent to",
  "paiement de", "achat de", "retrait de", "debit de", "débit de",
  "you sent", " envoye ", " envoyé ", " sent ", " debited ",
  "le depot vers", "le dépôt vers"
];

function parseNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  // "12 345,67" → 12345.67  / "12,345.67" → 12345.67 / "1.530" → 1530 (FR thousands)
  let cleaned = s.replace(/\s/g, "");
  // Cas FR : "1.530" sans décimales → 1530. Détecter par longueur après le point.
  // Si on a un seul séparateur point/virgule suivi de 3 chiffres exactement, c'est milliers.
  const m = cleaned.match(/^(\d+)[.,](\d{3})$/);
  if (m) {
    cleaned = m[1] + m[2];
  } else {
    // Standard : virgule = décimale FR, point = décimale EN, gérer les milliers
    cleaned = cleaned.replace(/[.,](\d{3})(?=[^\d]|$)/g, "$1");
    cleaned = cleaned.replace(/,(\d{1,2}$)/, ".$1");
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function detectType(text: string): string {
  const lower = text.toLowerCase();
  for (const k of OUTGOING_KEYWORDS) if (lower.includes(k)) return "OUTGOING";
  for (const k of INCOMING_KEYWORDS) if (lower.includes(k)) return "INCOMING";
  return "UNKNOWN";
}

function extractAmount(text: string): number | null {
  const patterns = [
    new RegExp(`montant\\s*[:=]?\\s*(${NUMBER})\\s*${CURRENCY}`, "i"),
    new RegExp(`for\\s+(${NUMBER})\\s*${CURRENCY}`, "i"),
    new RegExp(`(?:reçu|recu|received|envoye|envoyé|paid|sent|paiement|transfert|achat|retrait|credit|crédit|debit|débit|depot|dépôt)\\s*(?:de\\s+|from\\s+|of\\s+)?(${NUMBER})\\s*${CURRENCY}`, "i"),
    new RegExp(`(${NUMBER})\\s*${CURRENCY}`, ""),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseNumber(m[1]);
  }
  return null;
}

function extractBalance(text: string): number | null {
  const patterns = [
    new RegExp(`(?:nouveau\\s+solde|new\\s+balance)(?:\\s+[A-Za-z]{1,12}){0,3}\\s+est\\s+(?:de\\s+|à\\s+|a\\s+)?(${NUMBER})\\s*${CURRENCY}`, "i"),
    new RegExp(`(?:nouveau\\s+solde|new\\s+balance|solde|balance)\\s*[:=]?\\s*(${NUMBER})\\s*${CURRENCY}`, "i"),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseNumber(m[1]);
  }
  return null;
}

function extractFee(text: string): number | null {
  const m = text.match(new RegExp(`(?:frais|fee|commission)\\s*[:=]?\\s*(${NUMBER})\\s*${CURRENCY}`, "i"));
  return m ? parseNumber(m[1]) : null;
}

function extractReference(text: string): string | null {
  const m = text.match(/(?:ref|réf|id\s+transaction|transaction\s+id)\s*[:=]?\s*([A-Z0-9.\-]+)/i);
  return m ? m[1] : null;
}

/**
 * Extrait la contrepartie (nom + numéro de téléphone si possible).
 * Format de sortie privilégié : "Nom (07XXXXXXXX)" ou "Nom (07******66)".
 */
function isValidName(raw: string): boolean {
  if (raw.length < 3 || raw.length > 60) return false;
  if (/^(FCFA|XOF|CFA|Ref|Réf|le|on|the|Payment|Successful|Transfer|Sent|You|Your|Votre)$/i.test(raw)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(raw);
}

function extractCounterparty(text: string): string | null {
  // 1. Numéro masqué Wave Business : (05******97)
  let phone: string | null = null;
  let m = text.match(/\((\d{1,4}\*+\d{1,4})\)/);
  if (m) phone = m[1];

  // 2. Sinon numéro normal après mot-clé téléphonique
  if (!phone) {
    m = text.match(/(?:vers|au|to|from|de|tel|tél|num|numéro|numero|n°|phone)\s+(?:le\s+)?(\+?\d{8,15})/i);
    if (m) phone = m[1];
  }

  let name: string | null = null;

  // 3a. Nom avant parenthèses contenant numéro masqué
  m = text.match(
    /((?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+|[A-ZÀ-Ý]{2,})(?:\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+|[A-ZÀ-Ý]{1,}))*)\s*\(\s*\d{1,4}\*+\d{1,4}\s*\)/
  );
  if (m) {
    const raw = m[1].trim();
    if (isValidName(raw)) name = raw;
  }

  // 3b. Nom après mot-clé d'action
  if (!name) {
    const keywords = "(?:received\\s+from|paid\\s+you\\s+by|sent\\s+to|paid\\s+to|reçu\\s+de|recu\\s+de|from|to|de|à|au)";
    const re = new RegExp(
      `${keywords}\\s+((?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'\\-]+|[A-ZÀ-Ý]{2,})(?:\\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'\\-]+|[A-ZÀ-Ý]{1,}))*)`,
      "i"
    );
    m = text.match(re);
    if (m) {
      let raw = m[1].trim();
      raw = raw.replace(/\s+(on|le|for|pour|sur|the|un|une|votre|your|nouveau|new|solde|balance)\b.*$/i, "").trim();
      if (isValidName(raw)) name = raw;
    }
  }

  if (name && phone) return `${name} (${phone})`;
  if (name) return name;
  if (phone) return phone;
  return null;
}

/**
 * Re-parse le raw_text d'une transaction et retourne UNIQUEMENT les champs
 * non vides détectés. À fusionner avec la transaction existante côté caller :
 * `{...transaction, ...parseFields(raw)}` — ça écrase seulement les champs détectés.
 */
export function parseFields(rawText: string): ParsedFields {
  if (!rawText || rawText.trim().length === 0) return {};
  const out: ParsedFields = {};

  const type = detectType(rawText);
  if (type !== "UNKNOWN") out.type = type;

  const amount = extractAmount(rawText);
  if (amount !== null) out.amount = amount;

  const balance = extractBalance(rawText);
  if (balance !== null) out.balance = balance;

  const fee = extractFee(rawText);
  if (fee !== null) out.fee = fee;

  const reference = extractReference(rawText);
  if (reference) out.reference = reference;

  const counterparty = extractCounterparty(rawText);
  if (counterparty) out.counterparty = counterparty;

  return out;
}
