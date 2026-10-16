// Fonction serverless Vercel : mode « Devine la règle ».
// Chaque joueur reçoit en secret une règle (« monotype », « Type Feu », « famille de 3 », « évolué »…).
// À l'oral, chacun son tour cite un Pokémon ; les autres répondent oui/non selon LEUR règle.
// Le but : deviner la règle des autres. Le serveur est seul à connaître les règles : un client ne reçoit
// que la sienne (et celles qu'il a trouvées). Endpoint et clés Redis (préfixe « rule: ») indépendants des autres modes.
const Redis = require('ioredis');

const MAX_DEX_ID = 1025, ROOM_TTL = 60 * 60 * 6, MAX_PLAYERS = 8;
const NAMES_KEY = 'whois_names_v1';            // cache partagé avec Qui est-ce ? / Wordle
const DEX_KEY = 'rule_dex_v1', DEX_TTL = 60 * 60 * 24 * 90;

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}
const roomKey = c => `rule:room:${c}`, lockKey = c => `rule:lock:${c}`;
const cleanCode = v => (v || '').toString().trim().toUpperCase();
const cleanName = v => (v || '').toString().replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
const foldFr = s => (s || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/[\s\-.]+/g, ' ').trim();
function genCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function cleanAvatar(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= MAX_DEX_ID ? n : null; }
function cleanCard(v) {
  const n = (x, max) => { x = Number(x); return Number.isInteger(x) && x >= 0 && x <= max ? x : 0; };
  if (!v || typeof v !== 'object') return { s: 0, c: 0, t: 0, m: '', x: null, b: 0, ti: 0, l: 1, tm: [], f: 0, h: 0, e: 0, j: 0, nf: 0, nc: 0 };
  const src = v.x && typeof v.x === 'object' ? v.x : {};
  const x = {};
  ['wp', 'ww', 'wb', 'qp', 'qc', 'qb', 'gf', 'gm'].forEach(k => { x[k] = n(src[k], 10000000); });
  const tm = (Array.isArray(v.tm) ? v.tm : []).map(Number).filter(id => Number.isInteger(id) && id >= 1 && id <= MAX_DEX_ID).slice(0, 6);
  // c cadre (couleur 0-15) · b fond 0-21 · ti titre 0-25 · f style de cadre 0-10 · h forme de la photo 0-6 · e effet 0-10 · j badge emoji 0-16 · nf police du pseudo 0-6 · nc couleur du pseudo 0-11
  return { s: n(v.s, 2), c: n(v.c, 15), t: n(v.t, 18), m: String(v.m || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40), x, b: n(v.b, 21), ti: n(v.ti, 25), l: Math.max(1, n(v.l, 99)), tm,
    f: n(v.f, 10), h: n(v.h, 6), e: n(v.e, 10), j: n(v.j, 16), nf: n(v.nf, 6), nc: n(v.nc, 11) };
}

// ---------- Les règles ----------
// d = { gen, h (dm), w (hg), stage 1-3, types[], fam (taille de la famille), final (ne peut plus évoluer), leg }
const TYPES_FR = { normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée' };
const RULES = [];
const add = (id, label, g, f) => RULES.push({ id, label, g, f });
Object.keys(TYPES_FR).forEach(k => add('t_' + k, 'Type ' + TYPES_FR[k], 'Types', d => d.types.includes(k)));
add('mono', 'Monotype', 'Types', d => d.types.length === 1);
add('dual', 'Double type', 'Types', d => d.types.length === 2);
add('base', 'De base (sans pré-évolution)', 'Évolution', d => d.stage === 1);
add('evolved', 'Évolué (a une pré-évolution)', 'Évolution', d => d.stage >= 2);
add('final', 'Dernier stade (n\'évolue plus)', 'Évolution', d => d.final);
add('canevo', 'Peut encore évoluer', 'Évolution', d => !d.final);
add('fam1', 'Famille de 1 (aucune évolution)', 'Famille', d => d.fam === 1);
add('fam2', 'Famille de 2', 'Famille', d => d.fam === 2);
add('fam3', 'Famille de 3', 'Famille', d => d.fam === 3);
add('fam4', 'Famille de 4 ou plus', 'Famille', d => d.fam >= 4);
for (let g = 1; g <= 9; g++) add('gen' + g, 'Génération ' + g, 'Génération', d => d.gen === g);
add('tall', 'Grand (1,5 m ou plus)', 'Gabarit', d => d.h >= 15);
add('small', 'Petit (50 cm ou moins)', 'Gabarit', d => d.h <= 5);
add('heavy', 'Lourd (100 kg ou plus)', 'Gabarit', d => d.w >= 1000);
add('light', 'Léger (10 kg ou moins)', 'Gabarit', d => d.w <= 100);
add('leg', 'Légendaire ou fabuleux', 'Statut', d => d.leg);
add('notleg', 'Ni légendaire ni fabuleux', 'Statut', d => !d.leg);
const RULE_BY_ID = {}; RULES.forEach(r => { RULE_BY_ID[r.id] = r; });
const PUBLIC_RULES = RULES.map(r => ({ id: r.id, label: r.label, group: r.g }));

// ---------- Données Pokémon (noms FR + fiches), mises en cache ----------
let namesMem = null, dexMem = null, idxMem = null;
async function getNames() {
  if (namesMem) return namesMem;
  try { const raw = await getRedis().get(NAMES_KEY); if (raw) { namesMem = JSON.parse(raw); return namesMem; } } catch (e) {}
  try {
    const query = `query { pokemon_v2_pokemonspeciesname(where: { language_id: { _eq: 5 }, pokemon_species_id: { _lte: ${MAX_DEX_ID} } }) { pokemon_species_id name } }`;
    const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const rows = (await res.json()).data.pokemon_v2_pokemonspeciesname;
    if (!Array.isArray(rows) || rows.length < 900) throw new Error('incomplet');
    const map = {}; rows.forEach(r => { map[r.pokemon_species_id] = r.name; });
    namesMem = map; try { await getRedis().set(NAMES_KEY, JSON.stringify(map), 'EX', 60 * 60 * 24 * 30); } catch (e) {}
    return map;
  } catch (e) { return null; }
}
// dex[id] = [gen, taille, poids, stade, type1, type2, taille de la famille, dernier stade (0/1), légendaire/fabuleux (0/1)]
async function getDex() {
  if (dexMem) return dexMem;
  try { const raw = await getRedis().get(DEX_KEY); if (raw) { dexMem = JSON.parse(raw); return dexMem; } } catch (e) {}
  try {
    const query = `query { pokemon_v2_pokemonspecies(where: { id: { _lte: ${MAX_DEX_ID} } }, order_by: { id: asc }) {
      id generation_id evolves_from_species_id evolution_chain_id is_legendary is_mythical
      pokemon_v2_pokemons(where: { is_default: { _eq: true } }) { height weight pokemon_v2_pokemontypes(order_by: { slot: asc }) { pokemon_v2_type { name } } } } }`;
    const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const rows = (await res.json()).data.pokemon_v2_pokemonspecies;
    if (!Array.isArray(rows) || rows.length < 1000) throw new Error('incomplet');
    const parent = {}, famSize = {}, hasChild = {};
    rows.forEach(r => { parent[r.id] = r.evolves_from_species_id || 0; famSize[r.evolution_chain_id] = (famSize[r.evolution_chain_id] || 0) + 1; if (r.evolves_from_species_id) hasChild[r.evolves_from_species_id] = 1; });
    const stageOf = id => { let s = 1, p = parent[id], g = 0; while (p && g++ < 5) { s++; p = parent[p]; } return Math.min(s, 3); };
    const dex = {};
    rows.forEach(r => {
      const p = r.pokemon_v2_pokemons && r.pokemon_v2_pokemons[0]; if (!p) return;
      const t = (p.pokemon_v2_pokemontypes || []).map(x => x.pokemon_v2_type.name);
      dex[r.id] = [r.generation_id, p.height, p.weight, stageOf(r.id), t[0] || '', t[1] || '', famSize[r.evolution_chain_id] || 1, hasChild[r.id] ? 0 : 1, r.is_legendary || r.is_mythical ? 1 : 0];
    });
    if (Object.keys(dex).length < 1000) throw new Error('incomplet');
    dexMem = dex; try { await getRedis().set(DEX_KEY, JSON.stringify(dex), 'EX', DEX_TTL); } catch (e) {}
    return dex;
  } catch (e) { return null; }
}
const attrs = (dex, id) => { const d = dex[id]; return { gen: d[0], h: d[1], w: d[2], stage: d[3], types: [d[4], d[5]].filter(Boolean), fam: d[6], final: !!d[7], leg: !!d[8] }; };

// ---------- Salle ----------
async function withLock(code, fn) {
  const r = getRedis(), token = Math.random().toString(36).slice(2); let got = false;
  for (let i = 0; i < 20 && !got; i++) { got = (await r.set(lockKey(code), token, 'PX', 4000, 'NX')) === 'OK'; if (!got) await new Promise(ok => setTimeout(ok, 100)); }
  if (!got) throw new Error('Partie occupée, réessaie');
  try { return await fn(); } finally { try { if ((await r.get(lockKey(code))) === token) await r.del(lockKey(code)); } catch (e) {} }
}
async function getRoom(code) { const raw = await getRedis().get(roomKey(code)); return raw ? JSON.parse(raw) : null; }
async function saveRoom(code, room) { room.updatedAt = Date.now(); await getRedis().set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL); }
const allFound = room => { const ids = Object.keys(room.players); return ids.length > 1 && ids.every(g => ids.every(t => t === g || room.found[g + '>' + t])); };

function assignRules(room) {
  const ids = Object.keys(room.players), pool = shuffled(RULES.map(r => r.id));
  ids.forEach((id, i) => { room.players[id].rule = pool[i]; room.players[id].score = 0; });
  room.order = shuffled(ids); room.turn = 0; room.found = {}; room.wrong = {}; room.round = (room.round || 0) + 1;
}
function view(room, me) {
  const ended = room.status === 'ended';
  const players = Object.keys(room.players).map(id => {
    const p = room.players[id], mine = id === me, seen = mine || ended || !!room.found[me + '>' + id];
    return {
      id, name: p.name, avatar: p.avatar, card: p.card, score: p.score || 0, host: id === room.hostId,
      rule: seen && p.rule ? { id: p.rule, label: RULE_BY_ID[p.rule].label } : null,
      found: !!room.found[me + '>' + id], wrong: room.wrong[me + '>' + id] || 0,
      foundBy: Object.keys(room.players).filter(g => g !== id && room.found[g + '>' + id]).length
    };
  }).sort((a, b) => b.score - a.score);
  const speaker = room.status === 'playing' ? room.order[room.turn % room.order.length] : null;
  return { code: room.code, status: room.status, hostId: room.hostId, isHost: room.hostId === me, you: me, speaker, round: room.round || 0, players, now: Date.now() };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    if (req.method === 'GET') {
      const action = (req.query.action || 'state').toString();
      if (action === 'rules') { res.setHeader('Cache-Control', 'public, max-age=3600'); res.status(200).json({ rules: PUBLIC_RULES }); return; }
      if (action === 'names') {
        const names = await getNames(); res.setHeader('Cache-Control', 'public, max-age=86400');
        res.status(200).json({ byId: names ? Array.from({ length: MAX_DEX_ID }, (_, i) => names[i + 1] || '') : [] }); return;
      }
      const code = cleanCode(req.query.code), pid = (req.query.playerId || '').toString();
      const room = code ? await getRoom(code) : null;
      if (!room) { res.status(404).json({ error: 'Partie introuvable' }); return; }
      if (!room.players[pid]) { res.status(403).json({ error: 'Tu ne fais pas partie de cette partie' }); return; }
      if (action === 'check') {   // « Ce Pokémon est-il dans MA règle ? » : ne révèle que oui/non sur sa propre règle
        if (room.status !== 'playing') { res.status(400).json({ error: "La partie n'est pas en cours" }); return; }
        const [dex, names] = await Promise.all([getDex(), getNames()]);
        if (!dex || !names) { res.status(503).json({ error: 'Données du Pokédex indisponibles, réessaie' }); return; }
        if (!idxMem || idxMem.src !== names) { const idx = {}; Object.keys(names).forEach(i => { idx[foldFr(names[i])] = Number(i); }); idxMem = { src: names, idx }; }
        const id = idxMem.idx[foldFr(req.query.name)];
        if (!id || !dex[id]) { res.status(404).json({ error: 'Pokémon inconnu' }); return; }
        res.status(200).json({ id, name: names[id], yes: !!RULE_BY_ID[room.players[pid].rule].f(attrs(dex, id)) }); return;
      }
      res.status(200).json(view(room, pid)); return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non supportée' }); return; }
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } } body = body || {};
    const action = body.action;

    if (action === 'create') {
      const name = cleanName(body.name); if (!name) { res.status(400).json({ error: 'Pseudo manquant' }); return; }
      let code = genCode(); for (let i = 0; i < 5 && (await getRedis().exists(roomKey(code))); i++) code = genCode();
      const playerId = 'r_' + Math.random().toString(36).slice(2, 9);
      await saveRoom(code, { code, hostId: playerId, status: 'lobby', round: 0, order: [], turn: 0, found: {}, wrong: {}, players: { [playerId]: { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card), rule: null, score: 0 } } });
      res.status(200).json({ code, playerId }); return;
    }
    const code = cleanCode(body.code); if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
    const out = await withLock(code, async () => {
      const room = await getRoom(code); if (!room) return { status: 404, body: { error: 'Partie introuvable' } };
      const save = () => saveRoom(code, room);
      if (action === 'join') {
        const name = cleanName(body.name); if (!name) return { status: 400, body: { error: 'Pseudo manquant' } };
        let pid = (body.playerId || '').toString();
        if (!room.players[pid]) {
          if (room.status !== 'lobby') return { status: 409, body: { error: 'La partie a déjà commencé' } };
          if (Object.keys(room.players).length >= MAX_PLAYERS) return { status: 409, body: { error: 'Partie complète' } };
          pid = 'r_' + Math.random().toString(36).slice(2, 9);
        }
        room.players[pid] = Object.assign(room.players[pid] || { rule: null, score: 0 }, { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) });
        await save(); return { status: 200, body: { code, playerId: pid } };
      }
      const pid = (body.playerId || '').toString(), me = room.players[pid];
      if (!me) return { status: 403, body: { error: 'Tu ne fais pas partie de cette partie' } };
      const host = room.hostId === pid, v = () => view(room, pid);

      if (action === 'card') { me.card = cleanCard(body.card); const av = cleanAvatar(body.avatar); if (av) me.avatar = av; await save(); return { status: 200, body: { ok: true } }; }
      if (action === 'start') {
        if (!host) return { status: 403, body: { error: "Seul l'hôte peut lancer la partie" } };
        if (Object.keys(room.players).length < 2) return { status: 400, body: { error: 'Il faut au moins 2 joueurs' } };
        assignRules(room); room.status = 'playing'; await save(); return { status: 200, body: v() };
      }
      if (action === 'lobby') { if (!host) return { status: 403, body: { error: "Seul l'hôte peut faire ça" } }; room.status = 'lobby'; await save(); return { status: 200, body: v() }; }
      if (action === 'end') { if (!host) return { status: 403, body: { error: "Seul l'hôte peut terminer la partie" } }; room.status = 'ended'; await save(); return { status: 200, body: v() }; }
      if (action === 'next') {   // passe la parole : le joueur dont c'est le tour, ou l'hôte
        if (room.status !== 'playing') return { status: 400, body: { error: "La partie n'est pas en cours" } };
        if (!host && room.order[room.turn % room.order.length] !== pid) return { status: 403, body: { error: "Ce n'est pas ton tour" } };
        room.turn = (room.turn + 1) % room.order.length; await save(); return { status: 200, body: v() };
      }
      if (action === 'guess') {
        if (room.status !== 'playing') return { status: 400, body: { error: "La partie n'est pas en cours" } };
        const target = (body.target || '').toString(), rule = (body.rule || '').toString(), key = pid + '>' + target;
        if (target === pid || !room.players[target]) return { status: 400, body: { error: 'Joueur invalide' } };
        if (!RULE_BY_ID[rule]) return { status: 400, body: { error: 'Règle inconnue' } };
        if (room.found[key]) return { status: 400, body: { error: 'Tu as déjà trouvé sa règle' } };
        let correct = room.players[target].rule === rule, pts = 0;
        if (correct) {
          room.found[key] = 1; pts = Math.max(3, 10 - (room.wrong[key] || 0)); me.score = (me.score || 0) + pts;
          if (allFound(room)) room.status = 'ended';
        } else room.wrong[key] = (room.wrong[key] || 0) + 1;
        await save(); return { status: 200, body: { correct, points: pts, state: v() } };
      }
      if (action === 'leave') {
        delete room.players[pid]; room.order = room.order.filter(i => i !== pid);
        const left = Object.keys(room.players);
        if (!left.length) { await getRedis().del(roomKey(code)); return { status: 200, body: { ok: true } }; }
        if (room.hostId === pid) room.hostId = left[0];
        if (room.status === 'playing' && left.length < 2) room.status = 'ended';
        await save(); return { status: 200, body: { ok: true } };
      }
      if (action === 'kick') {
        if (!host) return { status: 403, body: { error: "Seul l'hôte peut exclure un joueur" } };
        const t = body.targetPlayerId; if (t === pid || !room.players[t]) return { status: 400, body: { error: 'Joueur invalide' } };
        delete room.players[t]; room.order = room.order.filter(i => i !== t); await save(); return { status: 200, body: v() };
      }
      return { status: 400, body: { error: 'Action inconnue' } };
    });
    res.status(out.status).json(out.body);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur', detail: String((e && e.message) || e) }); }
};
