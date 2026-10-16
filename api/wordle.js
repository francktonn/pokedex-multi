// Fonction serverless Vercel : mode « Pokédex Wordle » (course à plusieurs, ou solo).
// Séparée des deux autres jeux : autre endpoint, autres clés Redis (préfixe "wordle:").
//
// Principe : une manche = UN Pokémon secret commun à tous. Chaque joueur propose des Pokémon et
// reçoit des indices en couleur (type, génération, taille, poids, stade d'évolution).
// Le premier à trouver gagne la manche : moins il a utilisé d'essais, plus il marque de points.
// Le serveur est seul à connaître le secret : les clients ne reçoivent que les indices de LEURS
// propres propositions, et pour les autres joueurs un simple « nombre d'essais / meilleur score ».
const Redis = require('ioredis');

const MAX_DEX_ID = 1025;
const ROOM_TTL_SECONDS = 60 * 60 * 6;
const NAMES_REDIS_KEY = 'whois_names_v1';   // même cache que le mode « Qui est-ce ? » (id -> nom FR)
const DEX_REDIS_KEY = 'wordle_dex_v1';
const DEX_TTL_SECONDS = 60 * 60 * 24 * 90;

const MAX_TRIES = 10;          // essais par joueur et par manche
const ROUND_MS = 4 * 60 * 1000; // durée maximale d'une manche
const REVEAL_MS = 7000;        // pause d'affichage de la réponse
const MIN_ROUNDS = 1, MAX_ROUNDS = 10, DEFAULT_ROUNDS = 3;

const GENERATION_RANGES = {
  1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649],
  6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 1025]
};
const ALL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
function normalizeConfig(raw) {
  let gens = raw && Array.isArray(raw.generations)
    ? Array.from(new Set(raw.generations.map(Number).filter(g => Number.isInteger(g) && g >= 1 && g <= 9))).sort((x, y) => x - y)
    : [];
  if (!gens.length) gens = ALL_GENS.slice();
  return { generations: gens };
}
function poolIds(config) {
  const ids = [];
  normalizeConfig(config).generations.forEach(g => {
    for (let id = GENERATION_RANGES[g][0]; id <= GENERATION_RANGES[g][1]; id++) ids.push(id);
  });
  return ids;
}

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}
const roomKey = code => `wordle:room:${code}`;
const lockKey = code => `wordle:lock:${code}`;

function foldFr(str) {
  return (str || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'").replace(/[\s\-.]+/g, ' ').trim();
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function cleanAvatar(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DEX_ID ? n : null;
}
function cleanCard(v) {
  const n = (x, max) => { x = Number(x); return Number.isInteger(x) && x >= 0 && x <= max ? x : 0; };
  if (!v || typeof v !== 'object') return { s: 0, c: 0, t: 0, m: '', x: null };
  const src = v.x && typeof v.x === 'object' ? v.x : {};
  const x = {};
  ['wp', 'ww', 'wb', 'qp', 'qc', 'qb', 'gf', 'gm'].forEach(k => { x[k] = n(src[k], 10000000); });
  return { s: n(v.s, 2), c: n(v.c, 7), t: n(v.t, 18), m: String(v.m || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40), x };
}
const cleanCode = v => (v || '').toString().trim().toUpperCase();

// ---------- Noms français ----------
let namesMem = null, foldedMem = null;
async function getNames() {
  if (namesMem) return namesMem;
  try {
    const raw = await getRedis().get(NAMES_REDIS_KEY);
    if (raw) { namesMem = JSON.parse(raw); return namesMem; }
  } catch (e) {}
  try {
    const query = `query { pokemon_v2_pokemonspeciesname(where: { language_id: { _eq: 5 }, pokemon_species_id: { _lte: ${MAX_DEX_ID} } }) { pokemon_species_id name } }`;
    const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('GraphQL');
    const json = await res.json();
    const rows = json && json.data && json.data.pokemon_v2_pokemonspeciesname;
    if (!Array.isArray(rows) || rows.length < 900) throw new Error('Réponse incomplète');
    const map = {};
    rows.forEach(r => { map[r.pokemon_species_id] = r.name; });
    namesMem = map;
    try { await getRedis().set(NAMES_REDIS_KEY, JSON.stringify(map), 'EX', 60 * 60 * 24 * 30); } catch (e) {}
    return map;
  } catch (e) {
    return null;
  }
}
// nom replié (sans accents/majuscules) -> numéro
async function getNameIndex() {
  const names = await getNames();
  if (!names) return null;
  if (!foldedMem || foldedMem.src !== names) {
    const idx = {};
    Object.keys(names).forEach(id => { idx[foldFr(names[id])] = Number(id); });
    foldedMem = { src: names, idx };
  }
  return foldedMem.idx;
}

// ---------- Fiches (génération, taille, poids, stade d'évolution, types) ----------
// dex[id] = [generation, taille (dm), poids (hg), stade 1-3, type1, type2|'']
let dexMem = null;
async function getDex() {
  if (dexMem) return dexMem;
  try {
    const raw = await getRedis().get(DEX_REDIS_KEY);
    if (raw) { dexMem = JSON.parse(raw); return dexMem; }
  } catch (e) {}
  try {
    const query = `query { pokemon_v2_pokemonspecies(where: { id: { _lte: ${MAX_DEX_ID} } }, order_by: { id: asc }) {
      id generation_id evolves_from_species_id
      pokemon_v2_pokemons(where: { is_default: { _eq: true } }) {
        height weight pokemon_v2_pokemontypes(order_by: { slot: asc }) { pokemon_v2_type { name } }
      } } }`;
    const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('GraphQL');
    const json = await res.json();
    const rows = json && json.data && json.data.pokemon_v2_pokemonspecies;
    if (!Array.isArray(rows) || rows.length < 1000) throw new Error('Réponse incomplète');
    const parent = {};
    rows.forEach(r => { parent[r.id] = r.evolves_from_species_id || 0; });
    const stageOf = id => { let s = 1, p = parent[id], guard = 0; while (p && guard++ < 5) { s++; p = parent[p]; } return Math.min(s, 3); };
    const dex = {};
    rows.forEach(r => {
      const p = r.pokemon_v2_pokemons && r.pokemon_v2_pokemons[0];
      if (!p) return;
      const types = (p.pokemon_v2_pokemontypes || []).map(t => t.pokemon_v2_type.name);
      dex[r.id] = [r.generation_id, p.height, p.weight, stageOf(r.id), types[0] || '', types[1] || ''];
    });
    if (Object.keys(dex).length < 1000) throw new Error('Fiches incomplètes');
    dexMem = dex;
    try { await getRedis().set(DEX_REDIS_KEY, JSON.stringify(dex), 'EX', DEX_TTL_SECONDS); } catch (e) {}
    return dex;
  } catch (e) {
    return null;
  }
}

// ---------- Comparaison : une proposition contre le secret ----------
// Couleurs : g = exact (vert), o = proche / partiel (orange), r = faux (rouge).
// Flèches (d) : 1 = le secret est PLUS haut / grand / lourd / évolué, -1 = plus bas, 0 = identique.
function attrsOf(dex, id) {
  const d = dex[id];
  return { gen: d[0], h: d[1], w: d[2], stage: d[3], types: [d[4], d[5]].filter(Boolean) };
}
function cmpNum(g, s, closeFn) {
  if (g === s) return { c: 'g', d: 0 };
  return { c: closeFn(g, s) ? 'o' : 'r', d: s > g ? 1 : -1 };
}
function rowFor(id, secretId, dex, names) {
  const g = attrsOf(dex, id), s = attrsOf(dex, secretId);
  const sameTypes = g.types.length === s.types.length && g.types.every(t => s.types.indexOf(t) >= 0);
  const typeC = sameTypes ? 'g' : (g.types.some(t => s.types.indexOf(t) >= 0) ? 'o' : 'r');
  const gen = cmpNum(g.gen, s.gen, (a, b) => Math.abs(a - b) === 1);
  const height = cmpNum(g.h, s.h, (a, b) => a / b >= 0.8 && a / b <= 1.25);
  const weight = cmpNum(g.w, s.w, (a, b) => a / b >= 0.7 && a / b <= 1.43);
  const stage = cmpNum(g.stage, s.stage, () => false);
  return {
    id, name: names[id] || ('Pokémon n°' + id),
    types: g.types, gen: g.gen, height: g.h / 10, weight: g.w / 10, stage: g.stage,
    c: { types: typeC, gen: gen.c, height: height.c, weight: weight.c, stage: stage.c },
    d: { gen: gen.d, height: height.d, weight: weight.d, stage: stage.d }
  };
}
const greens = row => Object.keys(row.c).filter(k => row.c[k] === 'g').length;
function pointsForTries(n) { return Math.max(2, 11 - n); } // 1 essai = 10 pts … 9+ essais = 2 pts

// ---------- Verrou par partie ----------
async function withLock(code, fn) {
  const r = getRedis();
  const token = Math.random().toString(36).slice(2);
  let got = false;
  for (let i = 0; i < 20 && !got; i++) {
    got = (await r.set(lockKey(code), token, 'PX', 4000, 'NX')) === 'OK';
    if (!got) await new Promise(ok => setTimeout(ok, 100));
  }
  if (!got) throw new Error('Partie occupée, réessaie');
  try { return await fn(); }
  finally { try { if ((await r.get(lockKey(code))) === token) await r.del(lockKey(code)); } catch (e) {} }
}
async function getRoom(code) {
  const raw = await getRedis().get(roomKey(code));
  return raw ? JSON.parse(raw) : null;
}
async function saveRoom(code, room) {
  room.updatedAt = Date.now();
  await getRedis().set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}

// ---------- Déroulé ----------
function beginRound(room, index, names) {
  const id = room.deck[index];
  room.round = {
    index, pokemonId: id, name: names[id] || ('Pokémon n°' + id), startedAt: Date.now(),
    winnerId: null, points: 0, endedAt: null, guesses: {}, gaveUp: {}
  };
  room.status = 'playing';
}
function endRound(room, winnerId, points) {
  const r = room.round;
  r.endedAt = Date.now();
  r.winnerId = winnerId || null;
  r.points = points || 0;
  if (winnerId && room.players[winnerId]) room.players[winnerId].score += points;
  room.status = 'reveal';
}
function playerDone(room, pid) {
  const r = room.round, list = r.guesses[pid] || [];
  return !!r.gaveUp[pid] || list.length >= MAX_TRIES || list.indexOf(r.pokemonId) >= 0;
}
function tick(room, names) {
  const now = Date.now();
  let changed = false;
  for (let guard = 0; guard < 3; guard++) {
    if (room.status === 'playing') {
      const everyoneDone = Object.keys(room.players).length > 0 && Object.keys(room.players).every(pid => playerDone(room, pid));
      if (everyoneDone || now - room.round.startedAt >= ROUND_MS) { endRound(room, null, 0); changed = true; continue; }
    }
    if (room.status === 'reveal' && now - room.round.endedAt >= REVEAL_MS) {
      const next = room.round.index + 1;
      if (next >= room.totalRounds) room.status = 'finished';
      else beginRound(room, next, names);
      changed = true; continue;
    }
    break;
  }
  return changed;
}

// ---------- Vue envoyée aux clients ----------
function view(room, playerId, dex, names) {
  const now = Date.now();
  const r = room.round;
  const active = r && (room.status === 'playing' || room.status === 'reveal');
  const rowsOf = pid => (r.guesses[pid] || []).map(id => rowFor(id, r.pokemonId, dex, names));
  const players = Object.keys(room.players).map(pid => {
    const p = room.players[pid], o = { id: pid, name: p.name, avatar: p.avatar || null, card: p.card || null, score: p.score, attempts: 0, best: 0, solved: false, done: false };
    if (active) {
      const rows = rowsOf(pid);
      o.attempts = rows.length;
      o.best = rows.reduce((m, row) => Math.max(m, greens(row)), 0);
      o.solved = r.winnerId === pid;
      o.done = playerDone(room, pid);
    }
    return o;
  }).sort((a, b) => b.score - a.score);

  const out = {
    code: room.code, status: room.status, hostId: room.hostId, isHost: playerId === room.hostId,
    totalRounds: room.totalRounds, players, now,
    config: normalizeConfig(room.config), poolSize: poolIds(room.config).length,
    maxTries: MAX_TRIES, roundMs: ROUND_MS, revealMs: REVEAL_MS
  };
  if (active) {
    const revealed = room.status === 'reveal';
    out.round = {
      number: r.index + 1, startedAt: r.startedAt, endedAt: r.endedAt, revealed,
      winnerId: r.winnerId,
      winnerName: r.winnerId && room.players[r.winnerId] ? room.players[r.winnerId].name : null,
      points: r.points,
      mine: rowsOf(playerId),
      myDone: playerDone(room, playerId),
      iWon: r.winnerId === playerId,
      answer: revealed ? rowFor(r.pokemonId, r.pokemonId, dex, names) : null
    };
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    if (req.method === 'GET') {
      const action = (req.query.action || 'state').toString();

      if (action === 'names') {
        const names = await getNames();
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const byId = names ? Array.from({ length: MAX_DEX_ID }, (_, i) => names[i + 1] || '') : [];
        res.status(200).json({ byId });
        return;
      }

      const code = cleanCode(req.query.code);
      const playerId = (req.query.playerId || '').toString();
      if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
      let room = await getRoom(code);
      if (!room) { res.status(404).json({ error: 'Partie introuvable' }); return; }
      if (!room.players[playerId]) { res.status(403).json({ error: 'Tu ne fais pas partie de cette partie' }); return; }
      const [dex, names] = await Promise.all([getDex(), getNames()]);
      if (!dex || !names) { res.status(503).json({ error: 'Données du Pokédex indisponibles, réessaie dans un instant' }); return; }

      if (room.status === 'playing' || room.status === 'reveal') {
        room = await withLock(code, async () => {
          const fresh = await getRoom(code);
          if (!fresh) return null;
          if (tick(fresh, names)) await saveRoom(code, fresh);
          return fresh;
        });
        if (!room) { res.status(404).json({ error: 'Partie introuvable' }); return; }
      }
      res.status(200).json(view(room, playerId, dex, names));
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const action = body.action;

      if (action === 'create') {
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!name) { res.status(400).json({ error: 'Pseudo manquant' }); return; }
        let code, tries = 0;
        do { code = genCode(); tries++; } while ((await getRoom(code)) && tries < 8);
        const playerId = 'x_' + Math.random().toString(36).slice(2, 9);
        const room = {
          code, createdAt: Date.now(), status: 'lobby', hostId: playerId,
          players: { [playerId]: { name, score: 0, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) } },
          totalRounds: DEFAULT_ROUNDS, config: { generations: ALL_GENS.slice() }, deck: [], round: null
        };
        await saveRoom(code, room);
        res.status(200).json({ code, playerId });
        return;
      }

      if (action === 'join') {
        const code = cleanCode(body.code);
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!code || !name) { res.status(400).json({ error: 'Code ou pseudo manquant' }); return; }
        const out = await withLock(code, async () => {
          const room = await getRoom(code);
          if (!room) return { status: 404, body: { error: 'Partie introuvable' } };
          const playerId = 'x_' + Math.random().toString(36).slice(2, 9);
          room.players[playerId] = { name, score: 0, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) };
          await saveRoom(code, room);
          return { status: 200, body: { code, playerId } };
        });
        res.status(out.status).json(out.body);
        return;
      }

      const code = cleanCode(body.code);
      const playerId = body.playerId;
      if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
      const [dex, names] = await Promise.all([getDex(), getNames()]);
      if (!dex || !names) { res.status(503).json({ error: 'Données du Pokédex indisponibles, réessaie dans un instant' }); return; }
      const nameIndex = await getNameIndex();

      const result = await withLock(code, async () => {
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) return { status: 404, body: { error: 'Partie ou joueur introuvable' } };
        const save = () => saveRoom(code, room);
        tick(room, names);
        const v = () => view(room, playerId, dex, names);

        if (action === 'start') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut lancer la partie" } };
          if (room.status === 'playing' || room.status === 'reveal') return { status: 400, body: { error: 'Une partie est déjà en cours' } };
          const pool = poolIds(room.config);
          const total = Math.min(pool.length, Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Number(body.rounds) || room.totalRounds || DEFAULT_ROUNDS)));
          const deck = pool.slice();
          for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
          room.deck = deck.slice(0, total);
          room.totalRounds = total;
          Object.keys(room.players).forEach(pid => { room.players[pid].score = 0; });
          beginRound(room, 0, names);
          await save();
          return { status: 200, body: v() };
        }

        if (action === 'config') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut modifier les réglages" } };
          if (room.status !== 'lobby') return { status: 400, body: { error: 'Les réglages se changent au salon' } };
          if (body.generations !== undefined) room.config = normalizeConfig({ generations: body.generations });
          if (body.rounds !== undefined) room.totalRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Number(body.rounds) || DEFAULT_ROUNDS));
          await save();
          return { status: 200, body: v() };
        }

        if (action === 'lobby') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut revenir au salon" } };
          room.status = 'lobby'; room.round = null; room.deck = [];
          await save();
          return { status: 200, body: v() };
        }

        // Proposer un Pokémon : renvoie la ligne d'indices.
        if (action === 'guess') {
          if (room.status !== 'playing') return { status: 200, body: { closed: true } };
          const r = room.round;
          if (playerDone(room, playerId)) return { status: 200, body: { closed: true } };
          const raw = (body.guess || '').toString();
          const key = foldFr(raw);
          let id = nameIndex && nameIndex[key];
          if (!id && /^\d{1,4}$/.test(key)) id = Number(key);
          if (!id || id < 1 || id > MAX_DEX_ID || !dex[id]) return { status: 200, body: { unknown: true } };
          const list = r.guesses[playerId] = r.guesses[playerId] || [];
          if (list.indexOf(id) >= 0) return { status: 200, body: { duplicate: true } };
          list.push(id);
          const row = rowFor(id, r.pokemonId, dex, names);
          let points = 0;
          if (id === r.pokemonId) { points = pointsForTries(list.length); endRound(room, playerId, points); }
          await save();
          return { status: 200, body: { row, correct: id === r.pokemonId, points, tries: list.length } };
        }

        // Abandonner la manche (pour soi).
        if (action === 'giveup') {
          if (room.status === 'playing') { room.round.gaveUp[playerId] = true; tick(room, names); await save(); }
          return { status: 200, body: v() };
        }

        if (action === 'skip') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut passer la manche" } };
          if (room.status === 'playing') { endRound(room, null, 0); await save(); }
          return { status: 200, body: v() };
        }

        if (action === 'card') {
          room.players[playerId].card = cleanCard(body.card);
          await save();
          return { status: 200, body: { ok: true } };
        }

        if (action === 'leave') {
          delete room.players[playerId];
          const left = Object.keys(room.players);
          if (room.hostId === playerId) room.hostId = left.length ? left[0] : null;
          if (!left.length) { await getRedis().del(roomKey(code)); return { status: 200, body: { ok: true } }; }
          await save();
          return { status: 200, body: { ok: true } };
        }

        if (action === 'kick') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut exclure un joueur" } };
          if (body.targetPlayerId === playerId || !room.players[body.targetPlayerId]) return { status: 400, body: { error: 'Joueur invalide' } };
          delete room.players[body.targetPlayerId];
          await save();
          return { status: 200, body: v() };
        }

        return { status: 400, body: { error: 'Action inconnue' } };
      });
      res.status(result.status).json(result.body);
      return;
    }

    res.status(405).json({ error: 'Méthode non supportée' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur', detail: String((e && e.message) || e) });
  }
};
