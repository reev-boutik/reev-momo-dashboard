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
