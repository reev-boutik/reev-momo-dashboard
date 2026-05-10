/**
 * Modèle d'une ligne de la table public.momo_auto_capture côté Supabase.
 * Les champs nullables peuvent l'être quand le parser n'a rien réussi à
 * extraire (typique : type=UNKNOWN, amount=null).
 */
export interface AutoCapture {
  id: number;
  device_id: string;
  device_label: string;
  provider: string;
  type: string;
  category: string;  // MONEY / CABINE / WAVE_NORMAL / WAVE_MARCHAND
  amount: number | null;
  balance: number | null;
  fee: number | null;
  bonus: number | null;
  reference: string | null;
  counterparty: string | null;
  raw_text: string;
  title: string | null;
  package_name: string | null;
  source: string;
  sms_timestamp: string;
  captured_at: string;
  updated_at: string;
}

export const PROVIDER_DISPLAY: Record<string, string> = {
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  WAVE: "Wave",
  UNKNOWN: "Inconnu",
};

export const PROVIDER_COLOR: Record<string, string> = {
  ORANGE_MONEY: "#FF7900",
  MTN_MOMO: "#FFC107",
  MOOV_MONEY: "#005BBB",
  WAVE: "#1DCDFE",
  UNKNOWN: "#6B7280",
};

export const TYPE_DISPLAY: Record<string, string> = {
  INCOMING: "Reçu",
  OUTGOING: "Envoyé",
  BONUS: "Bonus",
  BALANCE_INQUIRY: "Solde",
  UNKNOWN: "Inconnu",
};

/**
 * Catégorie d'activité commerciale Reev Boutik.
 * Cf. MomoParser.kt#detectCategory pour les règles de détection.
 */
export const CATEGORY_DISPLAY: Record<string, string> = {
  MONEY: "Money",
  CABINE: "Cabine",
  PAY: "Pay",
  WAVE_NORMAL: "Wave",
  WAVE_MARCHAND: "Wave Marchand",
};

export const CATEGORY_COLOR: Record<string, string> = {
  MONEY: "#10B981",        // émeraude — opérations MoMo classiques
  CABINE: "#F59E0B",       // ambre — vente d'airtime/forfait
  PAY: "#EC4899",          // rose — encaissement marchand (compte séparé)
  WAVE_NORMAL: "#1DCDFE",  // cyan Wave
  WAVE_MARCHAND: "#0891B2", // cyan plus foncé — distinction marchand
};

export const CATEGORY_BG: Record<string, string> = {
  MONEY: "#D1FAE5",
  CABINE: "#FEF3C7",
  PAY: "#FCE7F3",
  WAVE_NORMAL: "#CFFAFE",
  WAVE_MARCHAND: "#A5F3FC",
};
