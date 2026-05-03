import { useEffect, useState } from "react";

const APK_URL =
  `${window.location.origin}${import.meta.env.BASE_URL}install/ReevMomoTracker-latest.apk`;

const PAGE_URL = window.location.href.split("#")[0] + "#/install";

export default function Install() {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}install/version.txt`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => setVersion(t.trim()))
      .catch(() => {});
  }, []);

  // QR code via API publique (qrserver.com) — pas de dépendance npm
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    PAGE_URL
  )}`;

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Installer Reev MoMo Tracker</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Capture automatique des transactions Mobile Money pour Android
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="text-center">
            <img
              src={qrSrc}
              alt="QR code"
              className="mx-auto rounded-lg border border-slate-200 dark:border-slate-700"
              width={240}
              height={240}
            />
            <p className="text-xs text-slate-500 mt-2">
              Scanne ce QR code avec le téléphone à équiper
            </p>
          </div>

          <div className="space-y-3">
            <a
              href={APK_URL}
              className="block w-full text-center rounded-lg bg-brand-500 hover:bg-brand-600 text-white py-3 font-medium"
              download
            >
              Télécharger l'APK
            </a>

            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
              <p className="font-medium">Installation</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Tape sur "Télécharger l'APK"</li>
                <li>Ouvre le fichier téléchargé</li>
                <li>Autorise l'install d'apps inconnues si demandé</li>
                <li>Si Play Protect bloque : "Plus de détails" → "Installer quand même"</li>
                <li>Ouvre l'app, autorise l'accès aux notifications</li>
                <li>Va dans Paramètres → renseigne le nom de la caisse + URL Supabase</li>
              </ol>
            </div>

            {version && (
              <div className="text-xs text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-2">
                Version : <code className="font-mono">{version}</code>
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-4">
          Lien direct :{" "}
          <a href={APK_URL} className="underline break-all">
            {APK_URL}
          </a>
        </div>
      </div>
    </div>
  );
}
