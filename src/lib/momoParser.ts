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
function extractCounterparty(text: string): string | null {
  // Format Wave Business : "received from Aboh Eunice (01******83)"
  let m = text.match(
    /(?:de|from|to|à|au|by)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'\-\s]{1,40}?)\s*\(\s*([0-9*+\s]{4,20})\s*\)/i
  );
  if (m) {
    const name = m[1].trim();
    const phone = m[2].replace(/\s+/g, "");
    return `${name} (${phone})`;
  }

  // Numéro plein dans le corps (style Orange : "vers le 0709455297")
  const phoneMatch = text.match(/(?:vers|au|to|from|de)\s+(?:le\s+)?(\+?[0-9]{8,15})/i);
  const rawPhone = phoneMatch ? phoneMatch[1] : null;

  // Numéro masqué seul entre parenthèses
  const maskedMatch = text.match(/\(([0-9*+\s]{4,20})\)/);
  const maskedPhone = maskedMatch ? maskedMatch[1].replace(/\s+/g, "") : null;

  // Nom seul (without phone in parens)
  let nameOnly: string | null = null;
  m = text.match(
    /(?:de|from)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'\-\s]{2,40}?)(?=[.,;]|\s+(?:le|on|nouveau|solde|ref|réf|pour|for)|\s+\d|\s*\(|\s*$)/i
  );
  if (m) nameOnly = m[1].trim();
  if (!nameOnly) {
    m = text.match(
      /(?:à|au|to)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'\-\s]{2,40}?)(?=[.,;]|\s+(?:le|on|nouveau|solde|ref|réf|effectué|completed|pour|for)|\s+\d|\s*\(|\s*$)/i
    );
    if (m) nameOnly = m[1].trim();
  }

  const numero = rawPhone || maskedPhone;
  if (nameOnly && numero) return `${nameOnly} (${numero})`;
  if (nameOnly) return nameOnly;
  if (numero) return numero;

  // Fallback : "numero: +225..." / "n°: ..."
  m = text.match(/(?:numero|numéro|num|n°)\s*[:=]?\s*(\+?[0-9 ]{6,15})/i);
  return m ? m[1].trim() : null;
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
