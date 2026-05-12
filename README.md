# Routing patch — Reev Guard v1.1

Ajoute la route `/pilotage` et le lien "Pilotage" dans la nav du dashboard.

## Contenu

```
momo_routing_patch/
└── dashboard/src/
    └── App.tsx     ← patché (3 modifs minimes)
```

## 3 modifications appliquées dans App.tsx

1. **Import** (ligne 15) :
   ```tsx
   import PilotagePage from "./pages/PilotagePage";
   ```

2. **Route** (dans la liste des `<Route>`, après `/sms`) :
   ```tsx
   <Route path="/pilotage" element={<PilotagePage />} />
   ```

3. **Tab nav** (dans le tableau `tabs`, après "Tous les SMS") :
   ```ts
   { to: "/pilotage", label: "Pilotage" },
   ```

Tous les autres fichiers du dashboard sont inchangés.

## Application

```powershell
cd D:\dev_android
.\reev-push.ps1
```

Le script copie le App.tsx dans le repo dashboard, commit + push,
GitHub Actions build, GitHub Pages publie. ~1-2 min.

Ensuite, F5 sur le dashboard → tu dois voir le nouveau lien **Pilotage**
dans la nav, entre "Tous les SMS" et "Installer l'app".

Clique dessus → page Pilotage s'affiche. Si aucun téléphone n'a poussé de
heartbeat, la liste sera vide jusqu'à ce qu'un téléphone le fasse
(automatique au démarrage de l'app via `startReevGuard()`).
