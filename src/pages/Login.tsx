import { useState } from "react";
import { getSupabase, getCreds, setCreds, resetClient } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const creds = getCreds();
  const [url, setUrl] = useState(creds?.url ?? "");
  const [key, setKey] = useState(creds?.key ?? "");

  async function sendLink() {
    setBusy(true);
    setMsg(null);
    if (!url || !key) {
      setMsg("Renseigne d'abord URL Supabase et clé anon.");
      setBusy(false);
      return;
    }
    setCreds(url, key);
    resetClient();
    const supa = getSupabase();
    if (!supa) {
      setMsg("Erreur d'init Supabase.");
      setBusy(false);
      return;
    }
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg(`Lien magique envoyé à ${email}. Vérifie ta boîte mail.`);
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 bg-white dark:bg-slate-800 rounded-2xl shadow p-6">
        <h1 className="text-xl font-semibold">Reev MoMo — Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connecte-toi par lien magique pour accéder au tableau de bord.
        </p>

        {!creds && (
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              URL Supabase
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxxx.supabase.co"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Clé anon
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGc…"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={sendLink}
          disabled={busy || !email}
          className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 text-sm font-medium"
        >
          {busy ? "Envoi…" : "Envoyer le lien magique"}
        </button>

        {msg && (
          <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 rounded-lg p-3">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
