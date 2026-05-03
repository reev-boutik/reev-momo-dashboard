import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Le dashboard a 2 sources possibles pour les credentials Supabase :
 *  1. Variables d'environnement Vite injectées au build (recommandé en prod)
 *  2. Saisie manuelle stockée dans localStorage (pratique pour test rapide)
 *
 * En GitHub Pages on n'a pas de moyen sûr d'injecter des secrets côté
 * client, donc l'URL et la clé anon iront en "build-time env" via
 * GitHub Actions secrets si tu veux. Sinon, fallback localStorage.
 */

const ENV_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const STORAGE_URL_KEY = "reev_supabase_url";
const STORAGE_KEY_KEY = "reev_supabase_anon_key";

export function getCreds(): { url: string; key: string } | null {
  const url = ENV_URL || localStorage.getItem(STORAGE_URL_KEY) || "";
  const key = ENV_KEY || localStorage.getItem(STORAGE_KEY_KEY) || "";
  if (!url || !key) return null;
  return { url, key };
}

export function setCreds(url: string, key: string) {
  localStorage.setItem(STORAGE_URL_KEY, url.trim().replace(/\/+$/, ""));
  localStorage.setItem(STORAGE_KEY_KEY, key.trim());
}

export function clearCreds() {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_KEY_KEY);
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const c = getCreds();
  if (!c) return null;
  _client = createClient(c.url, c.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return _client;
}

export function resetClient() {
  _client = null;
}
