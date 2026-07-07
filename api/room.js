// Fonction serverless Vercel : gère toute la logique d'une partie multijoueur.
// Stockage : Redis (n'importe quel serveur Redis "classique" — Upstash en mode
// Redis, Redis Cloud, un Redis auto-hébergé, etc.), via l'URL de connexion fournie
// dans la variable d'environnement REDIS_URL (voir README.md pour les instructions).
const Redis = require('ioredis');

const MAX_DEX_ID = 807; // Génération I à VII
const ROOM_TTL_SECONDS = 60 * 60 * 24; // les parties expirent après 24h d'inactivité

// En serverless, une même instance de fonction peut traiter plusieurs requêtes :
// on réutilise donc la connexion Redis d'un appel à l'autre au lieu d'en ouvrir
// une nouvelle à chaque fois (ce qui épuiserait vite le nombre de connexions
// autorisées par la plupart des offres Redis gratuites).
let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) {
      throw new Error('Variable d\'environnement REDIS_URL manquante');
    }
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false
    });
  }
  return redisClient;
}

// ---------- Utilitaires ----------

// Même logique de normalisation que côté client (accents/casse ignorés) pour comparer
// une proposition de nom au nom réel du Pokémon secret.
function foldFr(str) {
  return (str || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I, pour éviter la confusion
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomId() {
  return Math.floor(Math.random() * MAX_DEX_ID) + 1;
}

function formatSlugName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Récupère le nom français officiel d'un Pokémon depuis PokeAPI (appelé depuis le
// serveur : pas de souci de CORS, et le nom réel n'est jamais exposé aux autres joueurs).
async function fetchFrenchName(id) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) throw new Error('Erreur PokeAPI');
  const data = await res.json();
  const frEntry = (data.names || []).find(n => n.language && n.language.name === 'fr');
  return frEntry ? frEntry.name : formatSlugName(data.name);
}

function roomKey(code) {
  return `room:${code}`;
}

async function getRoom(code) {
  const raw = await getRedis().get(roomKey(code));
  return raw ? JSON.parse(raw) : null; // contrairement à @vercel/kv, ioredis renvoie du texte brut
}

async function saveRoom(code, room) {
  room.updatedAt = Date.now();
  // "EX" pose le TTL (en secondes) directement dans la même commande que le SET.
  await getRedis().set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}

// Tire un nouveau Pokémon secret pour CHAQUE joueur présent dans la partie, en
// parallèle (une seule "manche" démarre pour tout le monde en même temps). Ne
// touche pas aux scores. Met le statut de la partie à "playing".
async function startNewRound(room) {
  const pids = Object.keys(room.players);
  const draws = await Promise.all(pids.map(async (pid) => {
    const id = randomId();
    const name = await fetchFrenchName(id);
    return { pid, id, name };
  }));
  draws.forEach(({ pid, id, name }) => {
    room.players[pid].pokemonId = id;
    room.players[pid].pokemonName = name;
  });
  room.status = 'playing';
}

// Ne renvoie JAMAIS le nom du Pokémon secret des autres joueurs : seulement le sien
// (via `me`) et un booléen `hasPokemon` pour les autres. C'est le serveur qui tranche
// les devinettes, donc personne ne peut "tricher" en lisant les données brutes.
function sanitizeRoom(room, playerId) {
  const players = Object.keys(room.players).map(pid => {
    const p = room.players[pid];
    return {
      id: pid,
      name: p.name,
      score: p.score || 0,
      hasPokemon: !!p.pokemonId
    };
  });
  const me = playerId && room.players[playerId] ? room.players[playerId] : null;
  return {
    code: room.code,
    status: room.status || 'lobby',
    hostId: room.hostId || null,
    isHost: !!(playerId && room.hostId === playerId),
    players,
    me: me ? { pokemonId: me.pokemonId || null, pokemonName: me.pokemonName || null } : null
  };
}

// ---------- Handler ----------

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // ---- Lecture de l'état d'une partie (utilisé au chargement + sondage périodique) ----
    if (req.method === 'GET') {
      const code = (req.query.code || '').toString().trim().toUpperCase();
      const playerId = (req.query.playerId || '').toString();
      if (!code) {
        res.status(400).json({ error: 'Code manquant' });
        return;
      }
      const room = await getRoom(code);
      if (!room) {
        res.status(404).json({ error: 'Partie introuvable' });
        return;
      }
      res.status(200).json(sanitizeRoom(room, playerId));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = body.action;

      // ---- Créer une partie ----
      // Le créateur devient automatiquement l'hôte (seul lui peut lancer une manche).
      if (action === 'create') {
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!name) {
          res.status(400).json({ error: 'Pseudo manquant' });
          return;
        }
        let code, existing, attempts = 0;
        do {
          code = genCode();
          existing = await getRoom(code);
          attempts++;
        } while (existing && attempts < 8);

        const playerId = 'p_' + Math.random().toString(36).slice(2, 9);
        const room = {
          code,
          createdAt: Date.now(),
          status: 'lobby', // 'lobby' = en attente que l'hôte lance la 1ère manche, 'playing' = manche en cours
          hostId: playerId,
          players: { [playerId]: { name, score: 0, pokemonId: null, pokemonName: null } }
        };
        await saveRoom(code, room);
        res.status(200).json({ code, playerId });
        return;
      }

      // ---- Rejoindre une partie ----
      if (action === 'join') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!code || !name) {
          res.status(400).json({ error: 'Code ou pseudo manquant' });
          return;
        }
        const room = await getRoom(code);
        if (!room) {
          res.status(404).json({ error: 'Partie introuvable' });
          return;
        }
        const playerId = 'p_' + Math.random().toString(36).slice(2, 9);
        room.players[playerId] = { name, score: 0, pokemonId: null, pokemonName: null };
        // Rejoindre en cours de manche : le nouveau joueur attend simplement la
        // manche suivante (il n'a pas de secret tant que l'hôte n'en relance pas une).
        await saveRoom(code, room);
        res.status(200).json({ code, playerId });
        return;
      }

      // ---- Lancer une manche pour TOUT LE MONDE (réservé à l'hôte) ----
      // Utilisé pour la 1ère manche, et peut aussi être utilisé par l'hôte pour
      // relancer une manche manuellement à tout moment.
      if (action === 'start') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut lancer une manche" });
          return;
        }
        await startNewRound(room);
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Deviner le Pokémon d'un autre joueur ----
      if (action === 'guess') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const { playerId, targetId, guess } = body;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        const target = room.players[targetId];
        if (!target || !target.pokemonId) {
          res.status(200).json({ correct: false, gone: true });
          return;
        }
        const isCorrect = foldFr(guess) === foldFr(target.pokemonName);
        if (!isCorrect) {
          res.status(200).json({ correct: false });
          return;
        }

        room.players[playerId].score = (room.players[playerId].score || 0) + 1;
        const revealedName = target.pokemonName;
        target.pokemonId = null;
        target.pokemonName = null;

        // La manche ne se termine pas dès qu'un Pokémon est trouvé : elle continue
        // jusqu'à ce qu'il ne reste plus qu'UN SEUL joueur non trouvé. À ce moment,
        // la partie relance automatiquement une nouvelle manche pour tout le monde,
        // en conservant les scores, et le dernier joueur restant reçoit +1 point
        // bonus pour avoir survécu jusqu'au bout de la manche.
        let roundEnded = false;
        let lastPlayerName = null;
        const allPids = Object.keys(room.players);
        if (room.status === 'playing' && allPids.length >= 2) {
          const stillHiding = allPids.filter(pid => room.players[pid].pokemonId);
          if (stillHiding.length === 1) {
            roundEnded = true;
            const lastPid = stillHiding[0];
            room.players[lastPid].score = (room.players[lastPid].score || 0) + 1;
            lastPlayerName = room.players[lastPid].name;
            await startNewRound(room); // ré-attribue un secret à tout le monde, scores conservés
          }
        }

        await saveRoom(code, room);
        res.status(200).json({ correct: true, name: revealedName, roundEnded, lastPlayerName });
        return;
      }

      // ---- Quitter la partie ----
      if (action === 'leave') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (room && room.players[playerId]) {
          delete room.players[playerId];
          // Si l'hôte quitte, on transfère le rôle au joueur restant le plus ancien
          // pour que la partie ne reste pas bloquée sans personne pour lancer de manche.
          if (room.hostId === playerId) {
            const remaining = Object.keys(room.players);
            room.hostId = remaining.length ? remaining[0] : null;
          }
          await saveRoom(code, room);
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Action inconnue' });
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur', detail: String((e && e.message) || e) });
  }
};
