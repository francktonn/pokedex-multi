// Fonction serverless Vercel : mode « Qui est ce Pokémon ? » en multijoueur.
// Totalement séparée du jeu de devinettes (api/room.js) : autre endpoint, autres clés Redis
// (préfixe "whois:"), autre page (public/whois.html). Les deux jeux ne partagent rien.
//
// Principe : une manche = UN Pokémon commun à tous, affiché en silhouette. Le premier qui
// tape le bon nom gagne des points (plus la réponse est rapide, plus c'est payant). Le nom
// et le numéro du Pokémon ne sont JAMAIS envoyés aux clients avant la fin de la manche :
// l'image passe par ce serveur (action "img"), sous une URL qui ne contient pas le numéro.
// Pool : les 1025 espèces (génération I à IX).
const Redis = require('ioredis');

const MAX_DEX_ID = 1025;
const ROOM_TTL_SECONDS = 60 * 60 * 6;
const NAMES_REDIS_KEY = 'whois_names_v1';
const NAMES_TTL_SECONDS = 60 * 60 * 24 * 30;

const ROUND_MS = 25000;        // durée d'une manche
const REVEAL_MS = 5000;        // pause d'affichage de la réponse entre deux manches
const HINT1_MS = 10000;        // 1er indice : nombre de lettres
const HINT2_MS = 17000;        // 2ème indice : 1re lettre
const GENERATION_RANGES = {
  1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493], 5: [494, 649],
  6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 1025]
};
const ALL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// Valide une config reçue d'un client : jamais de confiance, on retombe sur « toutes les générations ».
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
const MIN_ROUNDS = 3, MAX_ROUNDS = 30, DEFAULT_ROUNDS = 10;

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}

const roomKey = code => `whois:room:${code}`;
const lockKey = code => `whois:lock:${code}`;

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
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Photo de profil : numéro de Pokédex (le sprite est affiché côté client). Jamais autre chose qu'un entier valide.
function cleanAvatar(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DEX_ID ? n : null;
}
function cleanCard(v) {
  const n = (x, max) => { x = Number(x); return Number.isInteger(x) && x >= 0 && x <= max ? x : 0; };
  return v && typeof v === 'object' ? { s: n(v.s, 2), c: n(v.c, 7) } : { s: 0, c: 0 };
}
const cleanCode = v => (v || '').toString().trim().toUpperCase();

// ---------- Noms français (1025 espèces), mis en cache ----------
let namesMem = null;
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
    try { await getRedis().set(NAMES_REDIS_KEY, JSON.stringify(map), 'EX', NAMES_TTL_SECONDS); } catch (e) {}
    return map;
  } catch (e) {
    return null;
  }
}
async function frenchNameOf(id) {
  const names = await getNames();
  if (names && names[id]) return names[id];
  // Repli : une requête REST pour ce seul Pokémon
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) throw new Error('Erreur PokeAPI');
  const data = await res.json();
  const fr = (data.names || []).find(n => n.language && n.language.name === 'fr');
  return fr ? fr.name : data.name;
}

// ---------- Verrou par partie (évite que deux bonnes réponses simultanées comptent toutes les deux) ----------
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

// ---------- Déroulé d'une partie ----------
async function beginRound(room, index) {
  const id = room.deck[index];
  const name = await frenchNameOf(id);
  room.round = { index, pokemonId: id, name, startedAt: Date.now(), winnerId: null, points: 0, endedAt: null, wrong: {} };
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

// Avance l'état dans le temps (appelé à chaque requête) : fin de manche au chrono,
// puis manche suivante ou fin de partie. Retourne true si la partie a changé.
async function tick(room) {
  const now = Date.now();
  let changed = false;
  for (let guard = 0; guard < 3; guard++) {
    if (room.status === 'playing' && now - room.round.startedAt >= ROUND_MS) {
      endRound(room, null, 0); changed = true; continue;
    }
    if (room.status === 'reveal' && now - room.round.endedAt >= REVEAL_MS) {
      const next = room.round.index + 1;
      if (next >= room.totalRounds) room.status = 'finished';
      else await beginRound(room, next);
      changed = true; continue;
    }
    break;
  }
  return changed;
}

function pointsForElapsed(ms) {
  if (ms < 5000) return 5;
  if (ms < 10000) return 4;
  if (ms < 17000) return 3;
  return 2;
}

// ---------- Vue envoyée aux clients ----------
function view(room, playerId) {
  const now = Date.now();
  const r = room.round;
  const players = Object.keys(room.players).map(pid => ({
    id: pid, name: room.players[pid].name, avatar: room.players[pid].avatar || null, card: room.players[pid].card || null, score: room.players[pid].score,
    solved: !!(r && r.winnerId === pid)
  })).sort((a, b) => b.score - a.score);

  const out = {
    code: room.code, status: room.status, hostId: room.hostId,
    isHost: playerId === room.hostId,
    totalRounds: room.totalRounds, players, now,
    config: normalizeConfig(room.config), poolSize: poolIds(room.config).length,
    roundMs: ROUND_MS, revealMs: REVEAL_MS
  };
  if (r && (room.status === 'playing' || room.status === 'reveal')) {
    const elapsed = now - r.startedAt;
    const revealed = room.status === 'reveal';
    out.round = {
      number: r.index + 1,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      revealed,
      winnerId: r.winnerId,
      winnerName: r.winnerId && room.players[r.winnerId] ? room.players[r.winnerId].name : null,
      points: r.points,
      // Indices : jamais le nom ni le numéro tant que la manche est en cours.
      letters: !revealed && elapsed >= HINT1_MS ? Array.from(r.name).length : null,
      firstLetter: !revealed && elapsed >= HINT2_MS ? Array.from(r.name)[0] : null,
      imgToken: r.startedAt, // change à chaque manche : sert à casser le cache du navigateur
      answer: revealed ? r.name : null,
      pokemonId: revealed ? r.pokemonId : null
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

      // Liste des noms pour l'autocomplétion (publique : c'est juste le Pokédex).
      if (action === 'names') {
        const names = await getNames();
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const byId = names ? Array.from({ length: MAX_DEX_ID }, (_, i) => names[i + 1] || '') : [];
        res.status(200).json({ names: names ? Object.values(names) : [], byId }); // byId[i] = nom du Pokémon n° i+1
        return;
      }

      const code = cleanCode(req.query.code);
      const playerId = (req.query.playerId || '').toString();
      if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
      let room = await getRoom(code);
      if (!room) { res.status(404).json({ error: 'Partie introuvable' }); return; }
      if (!room.players[playerId]) { res.status(403).json({ error: 'Tu ne fais pas partie de cette partie' }); return; }

      // Image du Pokémon de la manche en cours (le numéro n'apparaît jamais dans l'URL).
      if (action === 'img') {
        if (!room.round || (room.status !== 'playing' && room.status !== 'reveal')) { res.status(404).end(); return; }
        const id = room.round.pokemonId;
        const upstream = await fetch(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`);
        if (!upstream.ok) { res.status(502).end(); return; }
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=600');
        res.status(200).end(buf);
        return;
      }

      // État de la partie : le chrono fait avancer la partie, sous verrou.
      if (room.status === 'playing' || room.status === 'reveal') {
        room = await withLock(code, async () => {
          const fresh = await getRoom(code);
          if (!fresh) return null;
          if (await tick(fresh)) await saveRoom(code, fresh);
          return fresh;
        });
        if (!room) { res.status(404).json({ error: 'Partie introuvable' }); return; }
      }
      res.status(200).json(view(room, playerId));
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
        const playerId = 'w_' + Math.random().toString(36).slice(2, 9);
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
          const playerId = 'w_' + Math.random().toString(36).slice(2, 9);
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

      const result = await withLock(code, async () => {
        const room = await getRoom(code);
        if (!room || !room.players[playerId]) return { status: 404, body: { error: 'Partie ou joueur introuvable' } };
        const save = () => saveRoom(code, room);
        await tick(room);

        // Lancer / relancer la partie (hôte) : tire un paquet de Pokémon sans doublon.
        if (action === 'start') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut lancer la partie" } };
          if (room.status === 'playing' || room.status === 'reveal') return { status: 400, body: { error: 'Une partie est déjà en cours' } };
          const pool = poolIds(room.config);
          const total = Math.min(pool.length, Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Number(body.rounds) || room.totalRounds || DEFAULT_ROUNDS)));
          room.deck = shuffled(pool).slice(0, total);
          room.totalRounds = total;
          Object.keys(room.players).forEach(pid => { room.players[pid].score = 0; });
          await beginRound(room, 0);
          await save();
          return { status: 200, body: view(room, playerId) };
        }

        // Réglages de la partie (hôte, au salon) : générations incluses + nombre de manches.
        if (action === 'config') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut modifier les réglages" } };
          if (room.status !== 'lobby') return { status: 400, body: { error: 'Les réglages se changent au salon' } };
          if (body.generations !== undefined) room.config = normalizeConfig({ generations: body.generations });
          if (body.rounds !== undefined) room.totalRounds = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Number(body.rounds) || DEFAULT_ROUNDS));
          await save();
          return { status: 200, body: view(room, playerId) };
        }

        // Retour au salon après une partie terminée (hôte).
        if (action === 'lobby') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut revenir au salon" } };
          room.status = 'lobby'; room.round = null; room.deck = [];
          await save();
          return { status: 200, body: view(room, playerId) };
        }

        // Proposer un nom.
        if (action === 'guess') {
          if (room.status !== 'playing') return { status: 200, body: { correct: false, closed: true } };
          const r = room.round;
          const now = Date.now();
          // Anti-spam : une proposition toutes les 700 ms par joueur.
          if (r.wrong[playerId] && now - r.wrong[playerId] < 700) return { status: 200, body: { correct: false, tooFast: true } };
          if (foldFr(body.guess) !== foldFr(r.name)) {
            r.wrong[playerId] = now;
            await save();
            return { status: 200, body: { correct: false } };
          }
          const points = pointsForElapsed(now - r.startedAt);
          endRound(room, playerId, points);
          await save();
          return { status: 200, body: { correct: true, points, name: r.name } };
        }

        // Passer la manche (hôte) quand plus personne ne trouve.
        if (action === 'skip') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut passer la manche" } };
          if (room.status === 'playing') { endRound(room, null, 0); await save(); }
          return { status: 200, body: view(room, playerId) };
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
          return { status: 200, body: view(room, playerId) };
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
