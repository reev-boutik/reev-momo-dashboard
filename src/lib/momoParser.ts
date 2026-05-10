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
  category?: string;
}

const NUMBER = "[0-9]+(?:[ .,][0-9]{3})*(?:[.,][0-9]{1,2})?";
const CURRENCY = "(?:F\\s*CFA|FCFA|XOF|CFA|F\\b)";

const INCOMING_KEYWORDS = [
  // FR
  "vous avez reçu", "vous avez recu",
  "vous a payé", "vous a paye",
  "credit de", "crédit de", "credit:", "crédit:",
  "depot de", "dépôt de",
  "transfert reçu", "transfert recu",
  "paiement reçu", "paiement recu",
  "remboursement",
  " reçu ", " recu ",
  // EN
  "you have received", "you received", "received from",
  "deposit of", "credit of",
  "transfer received",
  "paid you", "payment received",
  "no fee on your payment",
  "refund",
  " received ", " credited "
];

const OUTGOING_KEYWORDS = [
  // FR
  "vous avez envoye", "vous avez envoyé",
  "vous avez paye", "vous avez payé",
  "vous avez transfere", "vous avez transféré", "vous avez transferé",
  "vous avez offert",
  "transfert effectue", "transfert effectué",
  "transfert de",
  "achat de",
  "paiement de", "paiement effectué", "paiement effectue",
  "retrait de", "retrait à",
  "effectué un retrait", "effectue un retrait",
  "fait un retrait",
  "debit de", "débit de", "débité", "debite",
  "facture payée", "facture payee",
  "depot vers", "dépôt vers",
  "rechargement de", "rechargement pour", "rechargement à",
  " envoye ", " envoyé ",
  // EN
  "you have sent", "you sent", "sent to",
  "transfer completed", "transfer of",
  "purchase of", "payment of",
  "withdrawal", "cashout", "cash out",
  "bill paid",
  " sent ", " debited "
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
  // Fallback Cabine forfait : "Vous avez offert le forfait Plus+ (500) au numéro X"
  // Le montant nominal du forfait est entre parenthèses, sans devise après.
  const forfaitMatch = text.match(/forfait[^()]{1,60}\(\s*(\d+)\s*\)/i);
  if (forfaitMatch) return parseNumber(forfaitMatch[1]);
  return null;
}

function extractBalance(text: string): number | null {
  const patterns = [
    // "Votre [nouveau] solde [Moov money/OM/etc] est [de] X FCFA" — couvre
    // "Votre nouveau solde Moov money est de 19 900 FCFA" et autres variantes
    new RegExp(`(?:votre\\s+)?(?:nouveau\\s+)?solde(?:\\s+[A-Za-z]{1,12}){0,3}\\s+est\\s+(?:de\\s+|à\\s+|a\\s+)?(${NUMBER})\\s*${CURRENCY}`, "i"),
    // "Nouveau solde: 12000 F" / "Solde: 12000 F"
    new RegExp(`(?:nouveau\\s+solde|new\\s+balance|solde|balance)\\s*[:=]?\\s*(${NUMBER})\\s*${CURRENCY}`, "i"),
    // "Votre solde EVD actuel est de X Fcfa" — Moov Cabine 110
    new RegExp(`(?:votre\\s+)?solde\\s+evd(?:\\s+actuel)?\\s+est\\s+(?:de\\s+|à\\s+|a\\s+)?(${NUMBER})\\s*${CURRENCY}`, "i"),
    // "Votre solde actuel est X Fcfa" — Moov Cabine 110
    new RegExp(`(?:votre\\s+)?solde\\s+actuel\\s+est\\s+(?:de\\s+|à\\s+|a\\s+)?(${NUMBER})\\s*${CURRENCY}`, "i"),
    // FALLBACK : "Nouveau solde : 87740" sans devise (Moov Cabine sender 207)
    new RegExp(`(?:nouveau\\s+solde|new\\s+balance)\\s*[:=]\\s*(${NUMBER})`, "i"),
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
 * Détecte la catégorie d'activité commerciale (MONEY / CABINE / WAVE_NORMAL /
 * WAVE_MARCHAND). Cascade en 6 étapes — premier match gagne.
 *
 * Doit rester synchronisé avec MomoParser.kt#detectCategory.
 *
 * @param rawText texte brut du SMS / notif
 * @param packageName package Android source (ex. "com.wave.business")
 * @param title expéditeur / titre de notif (ex. "207")
 * @param provider provider résolu si déjà connu (sinon laisser undefined)
 */
export function detectCategory(
  rawText: string,
  packageName?: string | null,
  title?: string | null,
  provider?: string | null
): string {
  const pkgLower = (packageName ?? "").toLowerCase();
  const lower = (rawText ?? "").toLowerCase();
  const isWaveProvider = provider === "WAVE";

  // 1. Wave Business par package
  if (pkgLower === "com.wave.business") return "WAVE_MARCHAND";

  // 2. Wave Business par signature SMS (numéro masqué)
  if (isWaveProvider && /\(\d{1,4}\*+\d{1,4}\)/.test(rawText ?? "")) {
    return "WAVE_MARCHAND";
  }

  // 3. Sender 207 — Orange Cabine
  const senderNum = (title ?? "").replace(/[^0-9]/g, "");
  if (senderNum === "207") return "CABINE";

  // 4. Mots-clés Cabine
  const cabineKeywords = [
    "rechargement de", "rechargement pour", "rechargement à",
    "transfert d'unités", "transfert d'unites", "transfert unites", "transfert unités",
    "transfer of units", "transfer of airtime",
    "transfert de credit", "transfert de crédit",
    "de credit vers", "de crédit vers",
    "transfere de credit", "transferé de credit", "transféré de credit",
    "offert le forfait", "offert un forfait",
    "solde evd",
  ];
  if (cabineKeywords.some(k => lower.includes(k))) return "CABINE";

  // 4b. Patterns forfait Orange
  if (/mix\s*\d+\s*f\b/i.test(rawText ?? "")) return "CABINE";
  if (/\bpass\s+\w+(?:\s+\w+)?\s+\d+\s*f\b/i.test(rawText ?? "")) return "CABINE";

  // 5. Wave Personal
  if (isWaveProvider) return "WAVE_NORMAL";

  // 6. Défaut
  return "MONEY";
}

/**
 * Re-parse le raw_text d'une transaction et retourne UNIQUEMENT les champs
 * non vides détectés. À fusionner avec la transaction existante côté caller :
 * `{...transaction, ...parseFields(raw)}` — ça écrase seulement les champs détectés.
 */
export function parseFields(
  rawText: string,
  packageName?: string | null,
  title?: string | null,
  provider?: string | null
): ParsedFields {
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

  out.category = detectCategory(rawText, packageName, title, provider);

  return out;
}
