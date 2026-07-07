# Pokédex Devinette — Multijoueur (auto-hébergé sur Vercel)

Ce dossier est un petit projet Vercel complet :

```
public/index.html   → ta page du jeu (identique à avant, juste branchée sur l'API)
api/room.js          → la fonction serverless qui gère les parties (créer, rejoindre,
                        tirer un Pokémon secret, deviner, quitter)
package.json          → dépendance @vercel/kv (stockage clé-valeur)
```

Le serveur est volontairement minimal : une seule fonction, un seul fichier de logique,
et une base Redis pour stocker l'état des parties (via `ioredis`, connecté avec l'URL
fournie dans la variable d'environnement `REDIS_URL`). Chaque partie expire
automatiquement au bout de 24h d'inactivité.

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

## 2. Brancher le stockage (Redis)

Sans ça, l'API ne pourra pas sauvegarder les parties. Il te faut une base Redis
"classique" (protocole RESP, accessible via une URL `redis://` ou `rediss://`) — par
exemple gratuitement chez **Upstash** ou **Redis Cloud**, mais n'importe quel
hébergeur Redis fonctionne.

### Option la plus simple : Upstash en mode Redis
1. Va sur https://upstash.com et crée un compte (gratuit).
2. Crée une base **Redis** (pas "Vercel KV" — le produit Redis "classique" d'Upstash).
3. Sur la page de la base, récupère l'URL de connexion **avec mot de passe** (souvent
   appelée "Redis Connect URL" ou "TLS URL"), du style :
   `rediss://default:xxxxxxxx@xxxxx.upstash.io:6379`
4. Dans ton projet Vercel : onglet **Settings → Environment Variables**, ajoute une
   variable nommée `REDIS_URL` avec cette valeur (coche les environnements
   Production/Preview/Development).
5. Redéploie le projet (bouton "Redeploy") pour que la variable soit prise en compte.

### Autres hébergeurs (Redis Cloud, Railway, un Redis auto-hébergé, etc.)
Même principe : récupère l'URL de connexion Redis (avec identifiants) fournie par ton
hébergeur, et mets-la dans la variable d'environnement `REDIS_URL` sur Vercel.

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
  logique dans `api/room.js` est portable : comme elle utilise Redis en direct (via
  `ioredis`), il suffit d'adapter la façon dont le handler reçoit `req`/`res` — le
  stockage lui-même n'a pas besoin de changer tant que `REDIS_URL` pointe vers une
  base Redis accessible.
