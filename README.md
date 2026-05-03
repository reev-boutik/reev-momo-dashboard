# Reev MoMo — Dashboard

Dashboard web pour visualiser les transactions Mobile Money capturées
automatiquement par l'app Android Reev MoMo Tracker.

- **Stack** : React 18 + TypeScript + Vite + TailwindCSS + Recharts + Supabase JS
- **Auth** : magic link email (Supabase Auth)
- **Hébergement** : GitHub Pages (workflow CI inclus)
- **Realtime** : oui, nouvelles transactions en direct via WebSocket Supabase

## Pages

| Route | Contenu |
|---|---|
| `#/` | KPIs du jour, totaux par opérateur, dernières opérations |
| `#/historique` | Liste filtrable + recherche + export CSV |
| `#/graphiques` | Volume reçu / 14 jours, par opérateur |
| `#/caisses` | Activité par téléphone (caisse) |

## Setup en 1 minute

### 1. Créer le repo sur GitHub

Crée un repo public (ou privé) `reev-momo-dashboard` sous `reev-boutik`.

### 2. Configurer Supabase pour autoriser ton domaine GitHub Pages

Sur Supabase > Authentication > URL Configuration :

- **Site URL** : `https://reev-boutik.github.io/reev-momo-dashboard/`
- **Redirect URLs** : ajoute la même URL

Sans ça, le magic link ne te ramènera pas sur le bon site.

### 3. Activer GitHub Pages

Repo > Settings > Pages :

- **Source** : `GitHub Actions` (pas `Deploy from a branch`)

### 4. (Optionnel) Injecter URL/clé Supabase au build

Repo > Settings > Secrets and variables > Actions :

- `VITE_SUPABASE_URL` = `https://xxxxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `eyJhbGc…`

Si tu ne fais pas ça, le dashboard te demandera URL et clé à la première
connexion (stockés dans `localStorage`). C'est OK pour test rapide,
mais pour production avec plusieurs utilisateurs c'est plus propre via
secrets.

### 5. Push

Push sur `main` → GitHub Actions build + deploy. Quelques minutes plus tard,
ton dashboard est en ligne sur :

`https://reev-boutik.github.io/reev-momo-dashboard/`

## Développement local

```bash
npm install
npm run dev
```

Le dev server tourne sur http://localhost:5173 et te demandera URL/clé Supabase
au premier chargement.

## Note sur le `base` Vite

`vite.config.ts` a `base: "/reev-momo-dashboard/"` car GitHub Pages sert
depuis ce sous-chemin. Si tu utilises un domaine custom (CNAME), remets
`base: "/"`.
