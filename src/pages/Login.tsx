import { useState } from "react";
import { getSupabase, getCreds, setCreds, resetClient } from "../lib/supabase";

type Mode = "signin" | "signup";

export default function Login() {
  const creds = getCreds();
  const [url, setUrl] = useState(creds?.url ?? "");
  const [key, setKey] = useState(creds?.key ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
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

    const { error } =
      mode === "signin"
        ? await supa.auth.signInWithPassword({ email, password })
        : await supa.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setMsg(error.message);
    } else if (mode === "signup") {
      setMsg(
        "Compte créé. Si Supabase exige la confirmation email, va valider dans ta boîte. Sinon connecte-toi."
      );
      setMode("signin");
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 bg-white dark:bg-slate-800 rounded-2xl shadow p-6">
        <h1 className="text-xl font-semibold">Reev MoMo — Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {mode === "signin"
            ? "Connecte-toi avec ton compte."
            : "Crée ton compte d'accès."}
        </p>

        {!creds && (
          <div className="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-4">
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

          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Min 6 caractères" : ""}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>

        <button
          onClick={submit}
          disabled={busy || !email || !password}
          className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 text-sm font-medium"
        >
          {busy ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
        </button>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
          className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          {mode === "signin"
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
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
