import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useSession } from "./hooks/useSession";
import { getCreds, getSupabase, clearCreds, resetClient } from "./lib/supabase";
import Login from "./pages/Login";
import Today from "./pages/Today";
import History from "./pages/History";
import Charts from "./pages/Charts";
import ByCashier from "./pages/ByCashier";
import Reconciliation from "./pages/Reconciliation";
import Reports from "./pages/Reports";
import Install from "./pages/Install";

export default function App() {
  // La page d'install est publique : on la sert sans auth pour que les
  // caisses puissent télécharger l'APK juste avec le QR code.
  if (window.location.hash.startsWith("#/install")) {
    return (
      <Routes>
        <Route path="/install" element={<Install />} />
        <Route path="*" element={<Install />} />
      </Routes>
    );
  }

  const creds = getCreds();
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!creds || !session) {
    return <Login />;
  }

  return (
    <div className="min-h-full flex flex-col">
      <Header email={session.user.email ?? ""} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/historique" element={<History />} />
          <Route path="/graphiques" element={<Charts />} />
          <Route path="/caisses" element={<ByCashier />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/rapports" element={<Reports />} />
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Header({ email }: { email: string }) {
  const tabs = [
    { to: "/", label: "Aujourd'hui", end: true },
    { to: "/historique", label: "Historique" },
    { to: "/graphiques", label: "Graphiques" },
    { to: "/caisses", label: "Caisses" },
    { to: "/reconciliation", label: "Réconciliation" },
    { to: "/rapports", label: "Rapports" },
    { to: "/install", label: "Installer l'app" },
  ];

  async function logout() {
    const supa = getSupabase();
    if (supa) await supa.auth.signOut();
  }

  function reconfigure() {
    clearCreds();
    resetClient();
    window.location.reload();
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-10">
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <span className="font-semibold whitespace-nowrap">Reev MoMo</span>
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                    isActive
                      ? "bg-brand-500 text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:inline truncate max-w-[180px]">{email}</span>
          <button
            onClick={logout}
            className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Déconnexion
          </button>
          <button
            onClick={reconfigure}
            className="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Changer de projet Supabase"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  );
}
