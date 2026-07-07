// Fonction serverless Vercel : gère toute la logique d'une partie multijoueur.
// Stockage : Redis (n'importe quel serveur Redis "classique" — Upstash en mode
// Redis, Redis Cloud, un Redis auto-hébergé, etc.), via l'URL de connexion fournie
// dans la variable d'environnement REDIS_URL (voir README.md pour les instructions).
const Redis = require('ioredis');

const MAX_DEX_ID = 1025; // Génération I à IX (aligné sur la config partagée par le client)
const ROOM_TTL_SECONDS = 60 * 60 * 24; // les parties expirent après 24h d'inactivité
const SPECIES_META_REDIS_KEY = 'species_meta_v1';
const SPECIES_META_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 jours : ces métadonnées bougent extrêmement rarement

// Bornes (numéro de Pokédex national) de chaque génération, identiques à celles utilisées
// côté client pour la fenêtre de configuration.
const GENERATION_RANGES = {
  1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649],
  6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 1025]
};
function generationOfId(id) {
  for (const gen in GENERATION_RANGES) {
    const range = GENERATION_RANGES[gen];
    if (id >= range[0] && id <= range[1]) return Number(gen);
  }
  return null;
}

// Pokémon starters (génération I à IX) : on part des premières formes puis on ajoute
// automatiquement leurs deux évolutions (3 stades consécutifs par ligne de starter).
const STARTER_BASE_SPECIES_IDS = [
  1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393,
  495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912
];
const STARTER_SPECIES_IDS = new Set(
  STARTER_BASE_SPECIES_IDS.flatMap(id => [id, id + 1, id + 2])
);

// Ultra-chimères et Pokémon Paradoxe : l'API ne les distingue pas via un champ dédié
// (is_legendary/is_mythical valent false pour eux), donc on les liste explicitement,
// à l'identique de la liste utilisée côté client.
const ULTRA_BEAST_SPECIES_IDS = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]);
const PARADOX_SPECIES_IDS = new Set([
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995,
  1006, 1007, 1009, 1010, 1020, 1021, 1022, 1023
]);

// Détecte le "type" d'une forme alternative à partir du suffixe de son nom technique,
// pour savoir si elle doit être proposée par le tirage selon la configuration de la partie.
function formKindFromSuffix(fullName, baseName) {
  const suffix = fullName.length > baseName.length ? fullName.slice(baseName.length + 1) : fullName;
  if (suffix.startsWith('mega') || suffix === 'primal') return 'mega';
  if (suffix.includes('gmax') || suffix.includes('eternamax')) return 'gmax';
  if (suffix.includes('alola') || suffix.includes('galar') || suffix.includes('hisui') || suffix.includes('paldea')) return 'regional';
  return 'other';
}

// ---------- Configuration de la partie (Pokémon disponibles) ----------
// Même forme que côté client (voir index.html) : centralise tout ce qui détermine quels
// Pokémon peuvent être tirés au sort. C'est le SERVEUR qui applique cette configuration
// au moment du tirage (startNewRound) : un client ne peut donc jamais "tricher" en
// bidouillant sa configuration locale.
function defaultConfig() {
  return {
    generations: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    categories: { legendary: true, mythical: true, ultrabeast: true, paradox: true, starter: true, baby: true },
    forms: { regional: true, mega: true, gmax: true }
  };
}

// Valide/complète une configuration reçue d'un client : ignore tout champ inconnu ou mal
// formé et retombe sur les valeurs par défaut plutôt que d'accepter n'importe quoi.
function normalizeConfig(raw) {
  const def = defaultConfig();
  if (!raw || typeof raw !== 'object') return def;

  let generations = Array.isArray(raw.generations)
    ? Array.from(new Set(raw.generations.map(Number).filter(g => Number.isInteger(g) && g >= 1 && g <= 9)))
    : [];
  if (!generations.length) generations = def.generations;

  const categories = Object.assign({}, def.categories);
  if (raw.categories && typeof raw.categories === 'object') {
    Object.keys(categories).forEach(k => {
      if (typeof raw.categories[k] === 'boolean') categories[k] = raw.categories[k];
    });
  }

  const forms = Object.assign({}, def.forms);
  if (raw.forms && typeof raw.forms === 'object') {
    Object.keys(forms).forEach(k => {
      if (typeof raw.forms[k] === 'boolean') forms[k] = raw.forms[k];
    });
  }

  return { generations, categories, forms };
}

// Reprend le même ordre de priorité que côté client pour rester cohérent avec l'étiquette
// de catégorie affichée dans la fiche du Pokémon.
function isSpeciesEligible(meta, settings) {
  if (!settings.generations.includes(meta.gen)) return false;
  if (meta.isMythical) return !!settings.categories.mythical;
  if (meta.isLegendary) return !!settings.categories.legendary;
  if (meta.isUltraBeast) return !!settings.categories.ultrabeast;
  if (meta.isParadox) return !!settings.categories.paradox;
  if (meta.isStarter) return !!settings.categories.starter;
  if (meta.isBaby) return !!settings.categories.baby;
  return true; // sauvage / fossile : toujours inclus
}

// Construit la liste des tirages possibles à partir des métadonnées et de la config
// actuelle. Chaque entrée porte à la fois l'id technique "pokemon" (utilisé pour l'image
// et pour redemander exactement cette forme) et l'id d'espèce (utilisé pour le nom
// français, identique quelle que soit la forme).
function buildDrawPoolServer(metaList, settings) {
  const pool = [];
  if (!metaList) {
    // Repli hors-ligne : PokeAPI injoignable et pas de cache, on ne peut filtrer que par
    // génération à partir des bornes connues localement (pas de forme dans ce cas).
    settings.generations.forEach(gen => {
      const range = GENERATION_RANGES[gen];
      if (!range) return;
      for (let id = range[0]; id <= range[1]; id++) pool.push({ pokemonId: id, speciesId: id });
    });
    return pool;
  }
  metaList.forEach(meta => {
    if (!isSpeciesEligible(meta, settings)) return;
    pool.push({ pokemonId: meta.defaultPokemonId, speciesId: meta.id });
    if (settings.forms.regional) meta.forms.regional.forEach(pid => pool.push({ pokemonId: pid, speciesId: meta.id }));
    if (settings.forms.mega) meta.forms.mega.forEach(pid => pool.push({ pokemonId: pid, speciesId: meta.id }));
    if (settings.forms.gmax) meta.forms.gmax.forEach(pid => pool.push({ pokemonId: pid, speciesId: meta.id }));
  });
  return pool;
}

function buildSpeciesMetaRecord(row) {
  const varieties = row.pokemon_v2_pokemons || [];
  const defaultVariety = varieties.find(v => v.is_default) || varieties[0] || { id: row.id, name: row.name };
  const forms = { mega: [], gmax: [], regional: [] };
  varieties.forEach(v => {
    if (v.is_default) return;
    const kind = formKindFromSuffix(v.name, row.name);
    if (forms[kind]) forms[kind].push(v.id);
  });
  return {
    id: row.id,
    gen: generationOfId(row.id),
    defaultPokemonId: defaultVariety.id,
    isLegendary: !!row.is_legendary,
    isMythical: !!row.is_mythical,
    isBaby: !!row.is_baby,
    isUltraBeast: ULTRA_BEAST_SPECIES_IDS.has(row.id),
    isParadox: PARADOX_SPECIES_IDS.has(row.id),
    isStarter: STARTER_SPECIES_IDS.has(row.id),
    forms
  };
}

// Métadonnées par espèce (génération/catégorie/formes), utilisées pour construire le pool
// de tirage selon la config. Mises en cache dans Redis (30 jours, ça ne change presque
// jamais) puis en mémoire pour la durée de vie de l'instance serverless, afin de ne pas
// interroger PokeAPI ni Redis à chaque manche lancée.
let speciesMetaMemCache = null;
let speciesMetaPromise = null;
async function getSpeciesMetaServer() {
  if (speciesMetaMemCache) return speciesMetaMemCache;
  if (speciesMetaPromise) return speciesMetaPromise;
  speciesMetaPromise = (async () => {
    try {
      const cachedRaw = await getRedis().get(SPECIES_META_REDIS_KEY);
      if (cachedRaw) {
        speciesMetaMemCache = JSON.parse(cachedRaw);
        return speciesMetaMemCache;
      }
    } catch (e) { /* Redis indisponible : on retente l'appel direct à PokeAPI ci-dessous */ }

    try {
      const query = `query {
        pokemon_v2_pokemonspecies(where: { id: { _lte: ${MAX_DEX_ID} } }) {
          id
          name
          is_legendary
          is_mythical
          is_baby
          pokemon_v2_pokemons {
            id
            name
            is_default
          }
        }
      }`;
      const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error('Erreur réseau GraphQL');
      const json = await res.json();
      const rows = json && json.data && json.data.pokemon_v2_pokemonspecies;
      if (!Array.isArray(rows) || !rows.length) throw new Error('Réponse GraphQL vide');
      const list = rows.map(buildSpeciesMetaRecord);
      speciesMetaMemCache = list;
      try { await getRedis().set(SPECIES_META_REDIS_KEY, JSON.stringify(list), 'EX', SPECIES_META_TTL_SECONDS); } catch (e) {}
      return list;
    } catch (e) {
      return null; // déclenche le repli "générations uniquement" dans buildDrawPoolServer
    }
  })();
  try {
    return await speciesMetaPromise;
  } finally {
    speciesMetaPromise = null;
  }
}

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
  const config = normalizeConfig(room.config);
  const metaList = await getSpeciesMetaServer().catch(() => null);
  let pool = buildDrawPoolServer(metaList, config);
  if (!pool.length) {
    // Filet de sécurité si la config exclut tout (ne devrait pas arriver, une génération
    // reste toujours sélectionnée et les Pokémon "sauvages" sont toujours inclus).
    pool = [{ pokemonId: randomId(), speciesId: null }];
  }
  const draws = await Promise.all(pids.map(async (pid) => {
    const entry = pool[Math.floor(Math.random() * pool.length)];
    const name = await fetchFrenchName(entry.speciesId || entry.pokemonId);
    return { pid, pokemonId: entry.pokemonId, name };
  }));
  draws.forEach(({ pid, pokemonId, name }) => {
    room.players[pid].pokemonId = pokemonId;
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
    me: me ? { pokemonId: me.pokemonId || null, pokemonName: me.pokemonName || null } : null,
    // Visible par tous (pour affichage), mais seul l'hôte peut la modifier — voir l'action 'config'.
    config: normalizeConfig(room.config)
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
          players: { [playerId]: { name, score: 0, pokemonId: null, pokemonName: null } },
          config: defaultConfig() // le créateur pourra l'ajuster ensuite depuis le lobby ; lui seul pourra la modifier
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

      // ---- Modifier la configuration de la partie (réservé à l'hôte) ----
      // S'applique à partir de la PROCHAINE manche lancée par l'hôte (action 'start') ;
      // ne relance pas de manche elle-même. Toujours revalidée/complétée côté serveur :
      // un client ne peut jamais imposer une config invalide ou usurper le rôle d'hôte.
      if (action === 'config') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut modifier la configuration" });
          return;
        }
        room.config = normalizeConfig(body.config);
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
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
