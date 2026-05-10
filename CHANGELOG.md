# dashboard_dynamic_filters — Filtre "Compte" dynamique sur la page Historique

## Le fix

Avant : le sélecteur "Tous opérateurs" était hardcodé avec les 5
opérateurs (Orange, MTN, Moov, Wave, Inconnu) et ne filtrait que sur
le provider, sans distinction de catégorie.

Après : un seul sélecteur "Tous comptes" qui :
- Liste UNIQUEMENT les couples (provider, category) effectivement
  présents dans les transactions chargées pour la période courante
- Filtre par couple complet (ex. "Moov Cabine" sans inclure "Moov Money")
- Se met à jour automatiquement quand la période change ou quand de
  nouvelles transactions sont chargées

## Exemple

Pour la journée d'aujourd'hui sur les 4 caisses, le sélecteur affichera :
- Tous comptes
- Moov Cabine
- Moov Money
- Orange Cabine
- Orange Money
- Orange Pay
- Wave
- Wave Marchand

Si tu changes la période et qu'aucune transaction MTN n'apparaît, le
sélecteur n'affichera pas "MTN MoMo" — pas de bruit visuel.

## Implémentation

### `src/pages/History.tsx` (1 fichier modifié)

- Ajout `category` dans le state local (couplé au provider)
- Calcul `accountKeys` via `useMemo` à partir de `data` (les transactions
  de la période)
- Ajout fonction locale `accountLabel(provider, category)` cohérente avec
  Android `MainActivity.accountLabel()` et dashboard `BalanceBar.accountLabel()`
- Remplacement du `<select>` par version dynamique avec `value="provider|category"`
- Ajout du critère `category` dans la closure de filtrage `useMemo`
- Mise à jour des dépendances du `useMemo` filter

## Pas de changement de hook ou de schéma

Tout est calculé côté client à partir de `data` déjà chargé via
`useCaptures`. Pas de nouvelle requête Supabase, pas de migration.

## Déploiement

```powershell
cd D:\dev_android
.\reev-push.ps1
```

Mode dashboard uniquement, 1 fichier.

## Vérification après build vert

Sur https://reev-boutik.github.io/reev-momo-dashboard/#/historique :
- Sélecteur "Tous comptes" en haut affiche uniquement les comptes
  présents dans la période
- Sélectionner "Orange Pay" → filtre exclusivement les transactions
  Orange catégorie PAY
- Le compteur "X sur Y transactions" se met à jour selon le filtre
