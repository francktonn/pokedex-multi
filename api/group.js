// Fonction serverless Vercel : « Groupe ». Un groupe est un petit « pointeur » persistant : il garde
// les membres entre les modes de jeu et indique à tout le monde quelle salle (sous-salle) du mode
// courant rejoindre. Les modes eux-mêmes (api/room.js, api/whois.js, api/wordle.js) ne sont pas touchés :
// chaque jeu crée une NOUVELLE salle, donc les scores repartent naturellement de zéro.
//
// Phases : idle (aucun jeu) -> prep (l'hôte configure, les membres attendent) -> live (salle envoyée,
// les membres la rejoignent automatiquement) -> idle (l'hôte ramène tout le monde au groupe).
// `seq` augmente à chaque changement de phase « live » ou de retour au groupe : c'est ce que les clients
// comparent pour savoir quand bouger.
const Redis = require('ioredis');

const MAX_DEX_ID = 1025;
const TTL = 60 * 60 * 12;
const MAX_MEMBERS = 12;
const ONLINE_MS = 15000;
const MODES = ['guess', 'whois', 'wordle'];

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}
const gKey = c => `group:g:${c}`;
const lockKey = c => `group:lock:${c}`;
const seenKey = c => `group:seen:${c}`;

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
const cleanName = v => (v || '').toString().replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

async function getGroup(code) {
  const raw = await getRedis().get(gKey(code));
  return raw ? JSON.parse(raw) : null;
}
async function saveGroup(code, g) {
  await getRedis().set(gKey(code), JSON.stringify(g), 'EX', TTL);
}
async function withLock(code, fn) {
  const r = getRedis();
  const token = Math.random().toString(36).slice(2);
  let got = false;
  for (let i = 0; i < 20 && !got; i++) {
    got = (await r.set(lockKey(code), token, 'PX', 4000, 'NX')) === 'OK';
    if (!got) await new Promise(ok => setTimeout(ok, 100));
  }
  if (!got) throw new Error('Groupe occupé, réessaie');
  try { return await fn(); }
  finally { try { if ((await r.get(lockKey(code))) === token) await r.del(lockKey(code)); } catch (e) {} }
}

// Vue envoyée aux clients. La salle (`sub`) n'est révélée qu'en phase « live » : tant que l'hôte configure, personne ne peut la rejoindre.
function publicState(g, seen, now) {
  const members = Object.keys(g.members).map(id => {
    const m = g.members[id];
    return { id, name: m.name, avatar: m.avatar, card: m.card, host: id === g.hostId, online: !!seen[id] && now - Number(seen[id]) < ONLINE_MS };
  });
  return {
    code: g.code, hostId: g.hostId, phase: g.phase, mode: g.phase === 'idle' ? null : g.mode,
    sub: g.phase === 'live' ? g.sub : null, seq: g.seq, members, now
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const r = getRedis();
    if (req.method === 'GET') {
      const code = cleanCode(req.query.code);
      const playerId = (req.query.playerId || '').toString();
      if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
      const g = await getGroup(code);
      if (!g) { res.status(404).json({ error: 'Groupe introuvable' }); return; }
      if (!g.members[playerId]) { res.status(403).json({ error: 'Tu ne fais plus partie de ce groupe' }); return; }
      const now = Date.now();
      await r.hset(seenKey(code), playerId, now);
      await r.expire(seenKey(code), TTL);
      const seen = await r.hgetall(seenKey(code));
      res.status(200).json(publicState(g, seen, now));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const action = (body.action || '').toString();

    if (action === 'create') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pseudo manquant' }); return; }
      let code = genCode();
      for (let i = 0; i < 5 && (await r.exists(gKey(code))); i++) code = genCode();
      const playerId = 'g_' + Math.random().toString(36).slice(2, 9);
      const g = {
        code, hostId: playerId, phase: 'idle', mode: null, sub: null, seq: 0,
        members: { [playerId]: { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) } }
      };
      await saveGroup(code, g);
      res.status(200).json({ code, playerId });
      return;
    }

    const code = cleanCode(body.code);
    if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }

    if (action === 'join') {
      const name = cleanName(body.name);
      if (!name) { res.status(400).json({ error: 'Pseudo manquant' }); return; }
      const out = await withLock(code, async () => {
        const g = await getGroup(code);
        if (!g) return { status: 404, body: { error: 'Groupe introuvable' } };
        const prev = (body.playerId || '').toString();
        let playerId = prev;
        if (!(prev && g.members[prev])) {
          if (Object.keys(g.members).length >= MAX_MEMBERS) return { status: 409, body: { error: 'Groupe complet' } };
          playerId = 'g_' + Math.random().toString(36).slice(2, 9);
        }
        g.members[playerId] = { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) };
        await saveGroup(code, g);
        return { status: 200, body: { code, playerId } };
      });
      res.status(out.status).json(out.body);
      return;
    }

    const playerId = (body.playerId || '').toString();
    const out = await withLock(code, async () => {
      const g = await getGroup(code);
      if (!g || !g.members[playerId]) return { status: 404, body: { error: 'Groupe ou membre introuvable' } };
      const isHost = playerId === g.hostId;
      const ok = () => ({ status: 200, body: { ok: true } });
      const hostOnly = () => ({ status: 403, body: { error: "Seul l'hôte peut faire ça" } });

      if (action === 'card') {
        g.members[playerId].card = cleanCard(body.card);
        const av = cleanAvatar(body.avatar);
        if (av) g.members[playerId].avatar = av;
        await saveGroup(code, g);
        return ok();
      }
      if (action === 'leave') {
        delete g.members[playerId];
        const ids = Object.keys(g.members);
        if (!ids.length) { await r.del(gKey(code), seenKey(code)); return ok(); }
        if (isHost) {
          // Passe la main au membre le plus récemment actif, et ramène le groupe au calme.
          const seen = await r.hgetall(seenKey(code));
          ids.sort((a, b) => Number(seen[b] || 0) - Number(seen[a] || 0));
          g.hostId = ids[0];
          g.phase = 'idle'; g.mode = null; g.sub = null; g.seq++;
        }
        await saveGroup(code, g);
        return ok();
      }
      if (!isHost) return hostOnly();

      if (action === 'kick') {
        const target = (body.target || '').toString();
        if (target && target !== g.hostId && g.members[target]) { delete g.members[target]; await saveGroup(code, g); }
        return ok();
      }
      // L'hôte choisit un mode et configure sa salle : les membres voient « l'hôte prépare… » sans pouvoir la rejoindre.
      if (action === 'prep') {
        const mode = (body.mode || '').toString();
        if (!MODES.includes(mode)) return { status: 400, body: { error: 'Mode inconnu' } };
        g.phase = 'prep'; g.mode = mode; g.sub = null;
        await saveGroup(code, g);
        return ok();
      }
      // L'hôte envoie le groupe : la salle (déjà configurée) devient visible, tout le monde la rejoint.
      if (action === 'live') {
        const sub = cleanCode(body.sub);
        const mode = (body.mode || g.mode || '').toString();
        if (!/^[A-Z0-9]{5}$/.test(sub) || !MODES.includes(mode)) return { status: 400, body: { error: 'Salle invalide' } };
        g.phase = 'live'; g.mode = mode; g.sub = sub; g.seq++;
        await saveGroup(code, g);
        return { status: 200, body: { ok: true, seq: g.seq } };
      }
      // L'hôte clôt le jeu : tout le monde revient au groupe.
      if (action === 'end') {
        g.phase = 'idle'; g.mode = null; g.sub = null; g.seq++;
        await saveGroup(code, g);
        return { status: 200, body: { ok: true, seq: g.seq } };
      }
      return { status: 400, body: { error: 'Action inconnue' } };
    });
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Erreur serveur' });
  }
};
