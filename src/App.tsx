import { useState, useRef, useEffect } from "react";
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
import AllSms from "./pages/AllSms";
import Install from "./pages/Install";
import ReparseAdmin from "./pages/ReparseAdmin";
import PilotagePage from "./pages/PilotagePage";
import BalanceBar from "./components/BalanceBar";

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
      <div className="sticky top-[57px] z-[5] bg-slate-50 dark:bg-slate-900 px-6 pt-4 pb-2">
        <BalanceBar />
      </div>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/historique" element={<History />} />
          <Route path="/graphiques" element={<Charts />} />
          <Route path="/caisses" element={<ByCashier />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/rapports" element={<Reports />} />
          <Route path="/sms" element={<AllSms />} />
          <Route path="/pilotage" element={<PilotagePage />} />
          <Route path="/admin/reparse" element={<ReparseAdmin />} />
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Header({ email }: { email: string }) {
  const tabs = [
    { to: "/", label: "Accueil", end: true },
    { to: "/historique", label: "Historique" },
    { to: "/graphiques", label: "Graphiques" },
    { to: "/caisses", label: "Caisses" },
    { to: "/reconciliation", label: "Réconciliation" },
    { to: "/rapports", label: "Rapports" },
    { to: "/sms", label: "Tous les SMS" },
    { to: "/pilotage", label: "Pilotage" },
    { to: "/install", label: "Installer l'app" },
  ];

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    setMenuOpen(false);
    const supa = getSupabase();
    if (supa) await supa.auth.signOut();
    // Garde URL + clé Supabase (pas de redemande au prochain login).
  }

  function reconfigure() {
    setMenuOpen(false);
    clearCreds();
    resetClient();
    window.location.reload();
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-10">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Burger mobile */}
          <button
            className="md:hidden p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <span className="font-semibold whitespace-nowrap">Reev MoMo</span>

          {/* Nav desktop */}
          <nav className="hidden md:flex gap-1 overflow-x-auto">
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

        {/* Menu utilisateur (engrenage) */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden z-20">
              <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700 truncate">
                {email}
              </div>
              <button
                onClick={logout}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Déconnexion
              </button>
              <button
                onClick={reconfigure}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
              >
                Reconfigurer Supabase
              </button>
              <a
                href="#/admin/reparse"
                onClick={() => setMenuOpen(false)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
              >
                Re-analyser les transactions
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Nav mobile (drawer simple) */}
      {mobileNavOpen && (
        <nav className="md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-3 text-sm border-b border-slate-100 dark:border-slate-700 ${
                  isActive
                    ? "bg-brand-500 text-white"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
