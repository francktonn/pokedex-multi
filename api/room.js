// Fonction serverless Vercel : gère toute la logique d'une partie multijoueur.
// Stockage : Redis (n'importe quel serveur Redis "classique" — Upstash en mode
// Redis, Redis Cloud, un Redis auto-hébergé, etc.), via l'URL de connexion fournie
// dans la variable d'environnement REDIS_URL (voir README.md pour les instructions).
const Redis = require('ioredis');

const MAX_DEX_ID = 1025; // Génération I à IX (aligné sur la config partagée par le client)
const ROOM_TTL_SECONDS = 60 * 60 * 24; // les parties expirent après 24h d'inactivité
const SPECIES_META_REDIS_KEY = 'species_meta_v2'; // v2 : les formes portent désormais aussi leur génération d'apparition (voir plus bas)
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
// ET la génération dans laquelle CETTE FORME (pas l'espèce de base !) a été introduite.
// C'est essentiel : une espèce peut venir d'une génération ancienne tout en ayant une
// forme (méga-évolution, forme régionale, G-Max…) apparue bien plus tard — par exemple
// Amphinobi (Greninja) vient de la génération 6, mais sa méga-évolution n'existe que
// depuis une génération ultérieure. Si cette génération-là n'est pas sélectionnée dans
// la config de la partie, la forme ne doit donc jamais pouvoir être tirée, même si
// l'espèce de base, elle, reste éligible.
// NB : ces bornes reflètent l'historique des jeux au moment de l'écriture. Si de
// nouvelles formes apparaissent dans de futurs jeux avec une génération différente de
// ce qui est indiqué ici, il faudra mettre à jour cette fonction en conséquence.
function formInfoFromSuffix(fullName, baseName) {
  const suffix = fullName.length > baseName.length ? fullName.slice(baseName.length + 1) : fullName;
  if (suffix.startsWith('mega') || suffix === 'primal') return { kind: 'mega', minGen: 6 }; // Méga-Évolutions : génération 6 (X/Y, ROSA)
  if (suffix.includes('gmax') || suffix.includes('eternamax')) return { kind: 'gmax', minGen: 8 }; // Dynamax Géant : génération 8 (Épée/Bouclier)
  if (suffix.includes('alola')) return { kind: 'regional', minGen: 7 }; // Formes d'Alola : génération 7
  if (suffix.includes('galar')) return { kind: 'regional', minGen: 8 }; // Formes de Galar : génération 8
  if (suffix.includes('hisui')) return { kind: 'regional', minGen: 8 }; // Formes de Hisui : génération 8 (Légendes Arceus)
  if (suffix.includes('paldea')) return { kind: 'regional', minGen: 9 }; // Formes de Paldea : génération 9
  return { kind: 'other', minGen: null };
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
    forms: { regional: true, mega: true, gmax: true },
    mode: 'ffa' // 'ffa' (chacun pour soi) ou 'teams' (équipes définies par l'hôte, tailles libres : 2v2, 3v2, 3v3…)
  };
}

// Nombre maximum d'équipes ouvrables par l'hôte (garde-fou, pas une vraie limite de jeu).
const MAX_TEAM_SLOTS = 8;

// S'assure qu'une room "ancienne" (créée avant l'ajout des équipes personnalisées)
// porte bien les champs nécessaires, sans jamais planter dessus.
function ensureTeamFields(room) {
  if (!Array.isArray(room.teamSlots)) room.teamSlots = [];
  if (!room.teamAssignments || typeof room.teamAssignments !== 'object') room.teamAssignments = {};
  if (typeof room.teamSlotSeq !== 'number') {
    room.teamSlotSeq = room.teamSlots.reduce((m, s) => Math.max(m, (s.id || 0) + 1), 0);
  }
  // Notes de bloc-note partagées entre coéquipiers (mode équipes) : { [teamId]: { [targetPlayerId]: { note, checks, pct, askedBy } } }.
  if (!room.teamNotes || typeof room.teamNotes !== 'object') room.teamNotes = {};
}

function teamSlotName(room, teamId) {
  const slot = (room.teamSlots || []).find(s => s.id === teamId);
  return slot ? slot.name : ('Équipe ' + (teamId + 1));
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// Répartit une liste de joueurs le plus équitablement possible entre les équipes
// ouvertes par l'hôte (round-robin après mélange) : avec un nombre de joueurs non
// multiple du nombre d'équipes, certaines équipes reçoivent naturellement un membre
// de plus (ex. 5 joueurs / 2 équipes → 3v2).
function distributeTeamsEvenly(pids, slotIds) {
  const shuffled = shuffleArray(pids);
  const map = {};
  shuffled.forEach((pid, idx) => { map[pid] = slotIds[idx % slotIds.length]; });
  return map;
}

// Calcule le regroupement d'équipes réellement utilisable pour DÉMARRER une manche :
// il faut que TOUS les joueurs actuellement présents soient assignés à une équipe
// existante, et qu'au moins 2 équipes aient chacune au moins un membre. Sinon, on
// retombe silencieusement sur le mode classique pour cette manche (l'hôte peut finir
// d'assigner les joueurs dans le lobby puis relancer).
function computeActiveTeams(room, pids) {
  const config = normalizeConfig(room.config);
  if (config.mode !== 'teams') return null;
  ensureTeamFields(room);
  const slotIds = new Set(room.teamSlots.map(s => s.id));
  const assignments = room.teamAssignments;
  const map = {};
  pids.forEach(pid => {
    const t = assignments[pid];
    if (t !== undefined && t !== null && slotIds.has(t)) map[pid] = t;
  });
  if (Object.keys(map).length !== pids.length) return null;
  const distinctTeamsWithPlayers = new Set(Object.values(map));
  if (distinctTeamsWithPlayers.size < 2) return null;
  return map;
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

  const mode = raw.mode === 'teams' ? 'teams' : 'ffa';

  return { generations, categories, forms, mode };
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
// Ajoute au pool les formes d'une liste (mega/gmax/regional) qui sont éligibles :
// il ne suffit pas que l'espèce de base soit dans une génération sélectionnée, il faut
// AUSSI que la génération d'apparition de LA FORME elle-même soit sélectionnée (voir
// formInfoFromSuffix ci-dessus pour le détail des générations par type de forme).
function pushEligibleForms(list, settings, pool, speciesId) {
  list.forEach(f => {
    if (f.minGen != null && !settings.generations.includes(f.minGen)) return;
    pool.push({ pokemonId: f.id, speciesId });
  });
}

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
    if (settings.forms.regional) pushEligibleForms(meta.forms.regional, settings, pool, meta.id);
    if (settings.forms.mega) pushEligibleForms(meta.forms.mega, settings, pool, meta.id);
    if (settings.forms.gmax) pushEligibleForms(meta.forms.gmax, settings, pool, meta.id);
  });
  return pool;
}

function buildSpeciesMetaRecord(row) {
  const varieties = row.pokemon_v2_pokemons || [];
  const defaultVariety = varieties.find(v => v.is_default) || varieties[0] || { id: row.id, name: row.name };
  const forms = { mega: [], gmax: [], regional: [] };
  varieties.forEach(v => {
    if (v.is_default) return;
    const info = formInfoFromSuffix(v.name, row.name);
    if (forms[info.kind]) forms[info.kind].push({ id: v.id, minGen: info.minGen });
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
//
// Mode équipes : les équipes sont celles définies MANUELLEMENT par l'hôte (voir
// room.teamSlots / room.teamAssignments, gérés via les actions dédiées) — elles ne
// sont donc jamais retirées au sort ici, et restent stables d'une manche à l'autre
// tant que l'hôte ne les modifie pas. Si l'assignation en cours ne couvre pas tous
// les joueurs présents (ou s'il manque une 2ème équipe non vide), on retombe
// silencieusement sur le mode classique pour cette manche.
async function startNewRound(room) {
  const pids = Object.keys(room.players);
  const teamsMap = computeActiveTeams(room, pids);
  if (teamsMap) {
    room.teams = teamsMap;
    room.activeMode = 'teams';
  } else {
    room.teams = null;
    room.activeMode = 'ffa';
  }

  const config = normalizeConfig(room.config);

  // Nouvelle manche = nouveaux secrets pour tout le monde : les notes partagées entre
  // coéquipiers portaient sur les secrets de la manche précédente, elles n'ont donc
  // plus lieu d'être — sans ce reset, elles resteraient stockées côté serveur et
  // réapparaîtraient aussitôt au sondage suivant (y compris après un "Tout effacer"
  // du joueur, qui ne peut agir que localement).
  room.teamNotes = {};

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
  ensureTeamFields(room);
  const teams = room.teams || null; // regroupement réellement actif pour la manche en cours (ou null)
  const players = Object.keys(room.players).map(pid => {
    const p = room.players[pid];
    const activeTeamId = teams && teams[pid] !== undefined ? teams[pid] : null;
    const assignedTeamId = room.teamAssignments[pid] !== undefined ? room.teamAssignments[pid] : null;
    const slotIndex = room.teamSlots.findIndex(s => s.id === (activeTeamId !== null ? activeTeamId : assignedTeamId));
    return {
      id: pid,
      name: p.name,
      score: p.score || 0,
      hasPokemon: !!p.pokemonId,
      // Équipe réellement en jeu cette manche (celle utilisée pour les devinettes/victoires).
      team: activeTeamId,
      teamName: activeTeamId !== null ? teamSlotName(room, activeTeamId) : null,
      // Équipe choisie par l'hôte dans le lobby (peut différer de `team` tant qu'une
      // nouvelle manche n'a pas été lancée), utile pour afficher/gérer les équipes
      // avant même le lancement de la partie.
      assignedTeam: assignedTeamId,
      assignedTeamName: assignedTeamId !== null ? teamSlotName(room, assignedTeamId) : null,
      teamColorIndex: slotIndex >= 0 ? slotIndex : null
    };
  });
  const me = playerId && room.players[playerId] ? room.players[playerId] : null;
  const config = normalizeConfig(room.config);

  // En mode équipes : on révèle le Pokémon (et donc les caractéristiques, via son id)
  // de TOUS ses coéquipiers — et uniquement des siens — au joueur qui demande son état
  // (une équipe peut compter plus de 2 membres : 3v3, 4v3…).
  let teammates = [];
  if (teams && playerId && teams[playerId] !== undefined) {
    const myTeam = teams[playerId];
    teammates = Object.keys(teams)
      .filter(pid => pid !== playerId && teams[pid] === myTeam && room.players[pid])
      .map(pid => {
        const a = room.players[pid];
        return { id: pid, name: a.name, pokemonId: a.pokemonId || null, pokemonName: a.pokemonName || null };
      });
  }

  // Bloc-note partagé : les notes prises par N'IMPORTE quel membre de TA propre
  // équipe (assignation faite par l'hôte, indépendante du fait qu'une manche soit en
  // cours) sur un adversaire donné, pour que toute l'équipe voie les mêmes coches en
  // quasi temps réel (au rythme du sondage périodique). On ne renvoie jamais les
  // notes des AUTRES équipes. `null` si le mode équipes n'est pas actif ou que le
  // joueur n'est pas encore assigné à une équipe (voir l'action 'teamNotePatch').
  const myAssignedTeam = room.teamAssignments[playerId];
  const teamNotes = (config.mode === 'teams' && playerId && myAssignedTeam !== undefined)
    ? (room.teamNotes[myAssignedTeam] || {})
    : null;

  return {
    code: room.code,
    status: room.status || 'lobby',
    hostId: room.hostId || null,
    isHost: !!(playerId && room.hostId === playerId),
    players,
    me: me ? { pokemonId: me.pokemonId || null, pokemonName: me.pokemonName || null } : null,
    teammates, // liste de tes coéquipiers en mode équipes (id/nom/pokémon), sinon []
    teamNotes, // bloc-note partagé avec tes coéquipiers : { [adversaireId]: {note,checks,pct,askedBy} }, sinon null
    activeMode: room.activeMode || 'ffa', // mode réellement utilisé pour la manche en cours
    // Équipes ouvertes par l'hôte, visibles par tous pour affichage, mais modifiables
    // par l'hôte seulement — voir les actions 'addTeamSlot'/'removeTeamSlot'/
    // 'renameTeamSlot'/'assignTeam'/'randomizeTeams'.
    teamSlots: room.teamSlots.map(s => ({ id: s.id, name: s.name })),
    // Visible par tous (pour affichage), mais seul l'hôte peut la modifier — voir l'action 'config'.
    config
  };
}

// ---------- Handler ----------

// Au-delà de ce délai sans nouvelles d'un joueur (son navigateur sondait l'état de
// la partie toutes les 3 s tant que l'onglet était ouvert — voir MP_POLL_MS côté
// client), on considère qu'il a fermé l'onglet / perdu la connexion, et sa place est
// libérée automatiquement. Sert de filet de sécurité : la fermeture "propre" d'un
// onglet déclenche normalement un envoi immédiat de l'action 'leave' (voir
// `navigator.sendBeacon` côté client), ce délai ne couvre donc que les crashs,
// pertes de réseau, etc.
const STALE_PLAYER_MS = 20000;

// Retire un joueur de la partie, où qu'il soit référencé (équipes, hôte…) — utilisé
// aussi bien pour un départ volontaire ('leave') qu'automatique (joueur inactif).
function removePlayerFromRoom(room, playerId) {
  if (!room.players[playerId]) return;
  delete room.players[playerId];
  if (room.teams && room.teams[playerId] !== undefined) delete room.teams[playerId];
  if (room.teamAssignments && room.teamAssignments[playerId] !== undefined) delete room.teamAssignments[playerId];
  // Si l'hôte part, on transfère le rôle au joueur restant le plus ancien pour que
  // la partie ne reste pas bloquée sans personne pour lancer de manche.
  if (room.hostId === playerId) {
    const remaining = Object.keys(room.players);
    room.hostId = remaining.length ? remaining[0] : null;
  }
}

// Purge les joueurs dont on n'a plus de nouvelles depuis trop longtemps (voir
// STALE_PLAYER_MS). `keepPlayerId` est le joueur à l'origine de la requête en cours :
// il vient forcément de donner signe de vie, on ne le purge jamais lui-même même si
// son `lastSeen` n'a pas encore été mis à jour au moment de l'appel.
function pruneStalePlayers(room, keepPlayerId) {
  const now = Date.now();
  let changed = false;
  Object.keys(room.players).forEach(pid => {
    if (pid === keepPlayerId) return;
    const lastSeen = typeof room.players[pid].lastSeen === 'number' ? room.players[pid].lastSeen : 0;
    if (now - lastSeen > STALE_PLAYER_MS) {
      removePlayerFromRoom(room, pid);
      changed = true;
    }
  });
  return changed;
}

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
      // Chaque sondage (toutes les 3 s tant que l'onglet est ouvert, voir
      // MP_POLL_MS côté client) vaut "signe de vie" pour ce joueur, et est
      // l'occasion de libérer la place de ceux qui n'en ont plus donné depuis
      // trop longtemps (voir STALE_PLAYER_MS / pruneStalePlayers).
      let changed = false;
      if (playerId && room.players[playerId]) {
        room.players[playerId].lastSeen = Date.now();
        changed = true;
      }
      if (pruneStalePlayers(room, playerId)) changed = true;
      if (changed) await saveRoom(code, room);
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
          players: { [playerId]: { name, score: 0, pokemonId: null, pokemonName: null, lastSeen: Date.now() } },
          config: defaultConfig(), // le créateur pourra l'ajuster ensuite depuis le lobby ; lui seul pourra la modifier
          teamSlots: [],
          teamAssignments: {},
          teamSlotSeq: 0
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
        room.players[playerId] = { name, score: 0, pokemonId: null, pokemonName: null, lastSeen: Date.now() };
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
        // Un lancement/relancement manuel par l'hôte ne rebat PAS les équipes : elles
        // sont gérées à la main par l'hôte (voir les actions dédiées ci-dessous) et
        // restent stables tant qu'il ne les modifie pas lui-même.
        await startNewRound(room);
        await saveRoom(code, room);
        res.status(200).json({ ok: true });
        return;
      }

      // ---- Changer le mode de jeu : 'ffa' (chacun pour soi) ou 'teams' (équipes
      // définies par l'hôte, tailles libres) (réservé à l'hôte). S'applique à partir
      // de la prochaine manche lancée par l'hôte, comme pour la configuration du pool
      // de Pokémon. Si aucune équipe n'existe encore au moment d'activer le mode
      // équipes, 2 équipes par défaut sont créées pour que l'hôte ait tout de suite
      // de quoi répartir les joueurs.
      if (action === 'setMode') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut changer le mode de jeu" });
          return;
        }
        ensureTeamFields(room);
        const mode = body.mode === 'teams' ? 'teams' : 'ffa';
        if (mode === 'teams') {
          const playerCount = Object.keys(room.players).length;
          if (playerCount < 2) {
            res.status(400).json({ error: 'Il faut au moins 2 joueurs pour activer le mode équipes.' });
            return;
          }
          if (room.teamSlots.length < 2) {
            room.teamSlots.push({ id: room.teamSlotSeq++, name: 'Équipe 1' });
            room.teamSlots.push({ id: room.teamSlotSeq++, name: 'Équipe 2' });
          }
        }
        room.config = normalizeConfig(Object.assign({}, room.config, { mode }));
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Ouvrir une nouvelle équipe (slot) (réservé à l'hôte) ----
      if (action === 'addTeamSlot') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut ouvrir une équipe" });
          return;
        }
        ensureTeamFields(room);
        if (room.teamSlots.length >= MAX_TEAM_SLOTS) {
          res.status(400).json({ error: `Maximum ${MAX_TEAM_SLOTS} équipes.` });
          return;
        }
        room.teamSlots.push({ id: room.teamSlotSeq++, name: `Équipe ${room.teamSlots.length + 1}` });
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Fermer une équipe (slot) (réservé à l'hôte) : les joueurs qui y étaient
      // assignés repassent "non assignés". ----
      if (action === 'removeTeamSlot') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const teamId = Number(body.teamId);
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut fermer une équipe" });
          return;
        }
        ensureTeamFields(room);
        room.teamSlots = room.teamSlots.filter(s => s.id !== teamId);
        Object.keys(room.teamAssignments).forEach(pid => {
          if (room.teamAssignments[pid] === teamId) delete room.teamAssignments[pid];
        });
        delete room.teamNotes[teamId]; // le bloc-note partagé de cette équipe n'a plus lieu d'être
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Renommer une équipe (slot) (réservé à l'hôte) ----
      if (action === 'renameTeamSlot') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const teamId = Number(body.teamId);
        const name = (body.name || '').toString().trim().slice(0, 18);
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut renommer une équipe" });
          return;
        }
        ensureTeamFields(room);
        const slot = room.teamSlots.find(s => s.id === teamId);
        if (slot && name) slot.name = name;
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Assigner (ou désassigner) un joueur à une équipe (réservé à l'hôte) ----
      // C'est ici que l'hôte compose librement ses équipes, de n'importe quelle
      // taille (2v2, 3v2, 3v3…) : chaque joueur est placé dans le slot de son choix,
      // ou remis "non assigné" en passant teamId à null.
      if (action === 'assignTeam') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const targetPlayerId = body.targetPlayerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut assigner les équipes" });
          return;
        }
        if (!room.players[targetPlayerId]) {
          res.status(404).json({ error: 'Joueur introuvable' });
          return;
        }
        ensureTeamFields(room);
        if (body.teamId === null || body.teamId === undefined) {
          delete room.teamAssignments[targetPlayerId];
        } else {
          const teamId = Number(body.teamId);
          if (!room.teamSlots.some(s => s.id === teamId)) {
            res.status(400).json({ error: 'Équipe introuvable' });
            return;
          }
          room.teamAssignments[targetPlayerId] = teamId;
        }
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Répartir aléatoirement tous les joueurs présents entre les équipes
      // déjà ouvertes (réservé à l'hôte) : pratique pour démarrer vite, l'hôte peut
      // ensuite ajuster à la main. ----
      if (action === 'randomizeTeams') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        if (room.hostId !== playerId) {
          res.status(403).json({ error: "Seul l'hôte de la partie peut mélanger les équipes" });
          return;
        }
        ensureTeamFields(room);
        if (room.teamSlots.length < 2) {
          res.status(400).json({ error: 'Ouvre au moins 2 équipes avant de mélanger.' });
          return;
        }
        const pids = Object.keys(room.players);
        room.teamAssignments = distributeTeamsEvenly(pids, room.teamSlots.map(s => s.id));
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Bloc-note partagé entre coéquipiers (mode équipes) : n'importe quel
      // membre de l'équipe peut cocher/décocher une info sur un adversaire donné, les
      // autres la voient au sondage suivant (voir `teamNotes` dans sanitizeRoom).
      // Ouvert à TOUS les joueurs déjà assignés à une équipe (pas réservé à l'hôte) :
      // c'est un outil de jeu partagé, pas un réglage de partie.
      // `patch` ne contient que les champs à modifier :
      //   { checks: { [itemId]: 'yes'|'no'|null }, askedBy: { [itemId]: bool },
      //     pct: { [itemId]: number }, note: string }
      if (action === 'teamNotePatch') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const targetPlayerId = (body.targetPlayerId || '').toString();
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        ensureTeamFields(room);
        const config = normalizeConfig(room.config);
        const myTeamId = room.teamAssignments[playerId];
        if (config.mode !== 'teams' || myTeamId === undefined) {
          res.status(400).json({ error: "Le bloc-note partagé n'est disponible qu'en mode équipes, une fois assigné à une équipe." });
          return;
        }
        if (!targetPlayerId) {
          res.status(400).json({ error: 'Joueur ciblé manquant' });
          return;
        }
        if (!room.teamNotes[myTeamId]) room.teamNotes[myTeamId] = {};
        if (!room.teamNotes[myTeamId][targetPlayerId]) {
          room.teamNotes[myTeamId][targetPlayerId] = { note: '', checks: {}, pct: {}, askedBy: {} };
        }
        const entry = room.teamNotes[myTeamId][targetPlayerId];
        const patch = body.patch || {};
        if (patch.checks && typeof patch.checks === 'object') {
          Object.keys(patch.checks).forEach(itemId => {
            const v = patch.checks[itemId];
            if (v === 'yes' || v === 'no') entry.checks[itemId] = v;
            else delete entry.checks[itemId];
          });
        }
        if (patch.askedBy && typeof patch.askedBy === 'object') {
          Object.keys(patch.askedBy).forEach(itemId => {
            if (patch.askedBy[itemId]) entry.askedBy[itemId] = true;
            else delete entry.askedBy[itemId];
          });
        }
        if (patch.pct && typeof patch.pct === 'object') {
          Object.keys(patch.pct).forEach(itemId => {
            const n = Number(patch.pct[itemId]);
            if (Number.isFinite(n)) entry.pct[itemId] = Math.max(0, Math.min(100, n));
            else delete entry.pct[itemId];
          });
        }
        if (typeof patch.note === 'string') {
          entry.note = patch.note.slice(0, 2000);
        }
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
        return;
      }

      // ---- Effacer entièrement les notes partagées prises sur un adversaire donné
      // (utilisé par le bouton "Tout effacer" côté client) : sans cette action, un
      // effacement resterait purement local et serait aussitôt écrasé par les
      // anciennes notes toujours stockées côté serveur, au prochain sondage. ----
      if (action === 'teamNoteReset') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const targetPlayerId = (body.targetPlayerId || '').toString();
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) {
          res.status(404).json({ error: 'Partie ou joueur introuvable' });
          return;
        }
        ensureTeamFields(room);
        const config = normalizeConfig(room.config);
        const myTeamId = room.teamAssignments[playerId];
        if (config.mode !== 'teams' || myTeamId === undefined) {
          res.status(400).json({ error: "Le bloc-note partagé n'est disponible qu'en mode équipes, une fois assigné à une équipe." });
          return;
        }
        if (room.teamNotes[myTeamId]) delete room.teamNotes[myTeamId][targetPlayerId];
        await saveRoom(code, room);
        res.status(200).json(sanitizeRoom(room, playerId));
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
        // Ce formulaire ne porte que sur le pool de Pokémon (générations/catégories/formes) :
        // on conserve le mode de jeu (ffa/teams) actuel, qui se change séparément (action 'setMode').
        const currentMode = normalizeConfig(room.config).mode;
        room.config = normalizeConfig(Object.assign({}, body.config, { mode: currentMode }));
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
        // En mode équipes : on ne peut pas "deviner" le Pokémon d'un coéquipier — il
        // est déjà révélé (voir `teammates` dans sanitizeRoom), le deviner n'aurait
        // aucun sens.
        if (room.teams && room.teams[playerId] !== undefined && room.teams[targetId] === room.teams[playerId]) {
          res.status(400).json({ error: "Tu ne peux pas deviner le Pokémon de ton propre équipier." });
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

        // Fin de manche :
        // - Mode classique (ffa) : la manche continue jusqu'à ce qu'il ne reste plus
        //   qu'UN SEUL joueur non trouvé, qui reçoit +1 point bonus pour avoir survécu.
        // - Mode équipes : la manche continue jusqu'à ce qu'une seule équipe ait encore
        //   un membre non trouvé (les autres équipes ont donc toutes été entièrement
        //   découvertes, quelle que soit leur taille respective — 2v2, 3v2, 3v3…) ;
        //   chaque membre de l'équipe gagnante reçoit +1 point bonus.
        // Dans les deux cas, une nouvelle manche démarre alors automatiquement pour
        // tout le monde, scores conservés (et équipes conservées en mode équipes,
        // puisqu'elles sont gérées à la main par l'hôte et non retirées au sort).
        let roundEnded = false;
        let lastPlayerName = null;
        let winningTeamNames = null;
        let winningTeamName = null;
        const allPids = Object.keys(room.players);
        if (room.status === 'playing' && allPids.length >= 2) {
          const teams = room.teams;
          const teamModeActive = teams && allPids.every(pid => teams[pid] !== undefined);
          if (teamModeActive) {
            const teamsHiding = new Set();
            allPids.forEach(pid => { if (room.players[pid].pokemonId) teamsHiding.add(teams[pid]); });
            if (teamsHiding.size === 1) {
              roundEnded = true;
              const winningTeam = Array.from(teamsHiding)[0];
              const winners = allPids.filter(pid => teams[pid] === winningTeam);
              winners.forEach(pid => { room.players[pid].score = (room.players[pid].score || 0) + 1; });
              winningTeamNames = winners.map(pid => room.players[pid].name);
              winningTeamName = teamSlotName(room, winningTeam);
              await startNewRound(room); // ré-attribue un secret à tout le monde, scores et équipes conservés
            }
          } else {
            const stillHiding = allPids.filter(pid => room.players[pid].pokemonId);
            if (stillHiding.length === 1) {
              roundEnded = true;
              const lastPid = stillHiding[0];
              room.players[lastPid].score = (room.players[lastPid].score || 0) + 1;
              lastPlayerName = room.players[lastPid].name;
              await startNewRound(room); // ré-attribue un secret à tout le monde, scores conservés
            }
          }
        }

        await saveRoom(code, room);
        res.status(200).json({ correct: true, name: revealedName, roundEnded, lastPlayerName, winningTeamNames, winningTeamName });
        return;
      }

      // ---- Quitter la partie ----
      if (action === 'leave') {
        const code = (body.code || '').toString().trim().toUpperCase();
        const playerId = body.playerId;
        const room = await getRoom(code);
        if (room && room.players[playerId]) {
          removePlayerFromRoom(room, playerId);
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
