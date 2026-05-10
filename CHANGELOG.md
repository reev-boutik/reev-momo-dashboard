# dashboard_balance_fix — Soldes uniques par (provider, category) sans somme device

## Le bug

La BalanceBar dashboard affichait des soldes **sommés** à travers les devices
pour chaque (provider, category). Comme un même portefeuille peut être
suivi par plusieurs `device_id` (réinstallation, changement de label, etc.),
le résultat était des chiffres artificiellement gonflés.

Exemple observé :
- "Orange Pay: 233 117 F" alors que le seul vrai compte avait ~9 560 F
- "Inconnu: 168 296 F" cumulant plusieurs entrées UNKNOWN historiques
- Deux chips "Wave" identiques (collision label entre WAVE_NORMAL et MONEY legacy)

## Le fix

### useLatestBalances.ts
- Avant : groupe par `(device_id, provider, category)` → multiples rows
  pour la même paire (provider, category) si plusieurs devices
- Après : groupe par `(provider, category)` **globalement** → 1 seul row
  par paire, peu importe le device source. Le row choisi est le plus
  récent (sms_timestamp DESC).
- Le `device_label` de la source la plus récente est conservé pour
  affichage tooltip.

### BalanceBar.tsx
- Suppression complète de l'agrégation `Map<string, sum>`.
- Affichage direct des rows reçues du hook (1 par paire).
- Total = somme de ces rows uniques (pas de double comptage).
- **Tooltip** sur chaque chip : "Dernier rapport : Caisse X le DD/MM HH:MM"
  → permet de tracer d'où vient chaque solde.
- **Label disambigué** : (WAVE, MONEY) → "Wave (legacy)" pour ne plus
  collisionner avec (WAVE, WAVE_NORMAL) → "Wave". À terme, après
  reparseAll + resync, les rows legacy seront recatégorisées et le
  suffixe (legacy) disparaîtra.

## Compromis assumé

Si **vraiment** plusieurs caisses gèrent des comptes physiques DIFFÉRENTS
du même type (ex. Caisse A et Caisse B avec 2 SIMs Orange Money distinctes),
seul le solde le plus récent sera affiché. C'est un compromis pour avoir
une vue compacte sans cumuls erronés.

Pour Reev Boutik en pratique :
- Caisse Moov suit Moov Money + Moov Cabine
- Caisse Orange suit Orange Money + Orange Cabine + Orange Pay
- Caisse Wave suit Wave (Personal et Marchand)
- Téléphone Orange Pay suit Orange Pay
Donc 1 device par (provider, category) majoritaire — pas d'effet pervers.

## Pas de modif Android

La BalanceBar Android (MainActivity + DAO) fonctionne déjà correctement
au niveau de chaque téléphone : la query DAO retourne 1 row par
(provider, category) sur ce device. Le bug était purement dashboard
(agrégation multi-device).

## Déploiement

```powershell
cd D:\dev_android
.\reev-push.ps1
```

Mode dashboard uniquement (2 fichiers). Le ZIP `momo_resync_all.zip` qui a
été poussé avant peut être déployé en parallèle — pas de conflit, fichiers
disjoints.

## Vérification après build vert

Sur https://reev-boutik.github.io/reev-momo-dashboard/ :
- Solde total réaliste (dans les 100k–200k F si tes 4 téléphones sont
  bien synchronisés et fonctionnels)
- 7-8 chips uniques sans duplication
- Tooltip visible au survol de chaque chip indiquant la source
- Plus de "Wave" en double : si un chip "Wave (legacy)" apparaît,
  c'est qu'il reste des transactions Wave non reparsée — lance
  reparseAll sur les caisses + Re-synchroniser tout

## Workflow recommandé combiné avec momo_resync_all

1. Push ce ZIP + le `momo_resync_all.zip` (déjà poussé)
2. Build CI vert
3. MAJ APK sur les 4 téléphones
4. Sur chaque téléphone : reparseAll
5. SQL Supabase : `TRUNCATE momo_auto_capture RESTART IDENTITY;`
6. Sur chaque téléphone : "Re-synchroniser tout vers Supabase"
7. Vérifier dashboard → soldes propres
