# Pokédex Devinette — Multijoueur (auto-hébergé sur Vercel)

Ce dossier est un petit projet Vercel complet :

```
public/index.html   → ta page du jeu (identique à avant, juste branchée sur l'API)
api/room.js          → la fonction serverless qui gère les parties (créer, rejoindre,
                        tirer un Pokémon secret, deviner, quitter)
package.json          → dépendance @vercel/kv (stockage clé-valeur)
```

Le serveur est volontairement minimal : une seule fonction, un seul fichier de logique,
et une base clé-valeur (Vercel KV, gratuite) pour stocker l'état des parties. Chaque
partie expire automatiquement au bout de 24h d'inactivité.

## 1. Créer le projet sur Vercel

Deux façons de faire, au choix :

### Option A — via l'interface web (le plus simple)
1. Va sur https://vercel.com et crée un compte (gratuit).
2. Mets ce dossier dans un dépôt GitHub (crée un repo, pousse ces fichiers dedans).
3. Sur Vercel : "Add New… → Project", choisis ce repo, laisse les réglages par défaut
   (Vercel détecte automatiquement `api/` comme des fonctions serverless et `public/`
   comme fichiers statiques), clique "Deploy".

### Option B — en ligne de commande
```bash
npm install -g vercel
cd pokedex-multi
vercel login
vercel        # suit les instructions, répond aux questions par défaut
vercel --prod # pour la mise en ligne définitive
```

## 2. Brancher le stockage (Vercel KV)

Sans ça, l'API ne pourra pas sauvegarder les parties.

1. Dans le dashboard Vercel, ouvre ton projet → onglet **Storage**.
2. Clique **Create Database** → choisis **KV** (propulsé par Upstash Redis, gratuit
   jusqu'à 30 000 commandes/mois — largement suffisant pour jouer entre amis).
3. Une fois créée, clique **Connect Project** et sélectionne ton projet. Vercel ajoute
   automatiquement les variables d'environnement nécessaires (`KV_REST_API_URL`,
   `KV_REST_API_TOKEN`, etc.) — tu n'as rien à copier-coller toi-même.
4. Redéploie le projet une fois (bouton "Redeploy") pour que les nouvelles variables
   d'environnement soient prises en compte.

## 3. Jouer

Une fois déployé, Vercel te donne une URL du style `https://ton-projet.vercel.app`.
Ouvre-la, clique sur le bouton 👥 (Multijoueur), crée une partie, partage le code à tes
amis — ils ouvrent la même URL et rejoignent avec le code. Chacun tire son Pokémon
secret sur son propre appareil, et peut essayer de deviner celui des autres.

## Notes techniques

- Le serveur est **seul à connaître** le nom du Pokémon secret de chaque joueur : les
  autres joueurs ne reçoivent qu'un statut "a un secret / pas encore tiré", jamais le
  nom réel. C'est donc plus robuste que la version précédente (où les données étaient
  visibles côté client).
- Les scores se rafraîchissent toutes les ~3 secondes (sondage périodique), pas en
  temps réel instantané — largement suffisant pour ce type de jeu entre amis, et ça
  reste très simple à héberger (pas de WebSocket, pas de serveur à faire tourner en
  continu).
- Si tu préfères un autre hébergeur que Vercel (Netlify, Cloudflare Workers, etc.), la
  logique dans `api/room.js` est portable : il suffit d'adapter la partie stockage
  (remplacer `@vercel/kv` par l'équivalent de la plateforme choisie) et la façon dont
  le handler reçoit `req`/`res`.
