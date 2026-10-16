// Fonction serverless Vercel : GROUPE (party) commun à tous les modes de jeu.
// Un groupe = un code, des membres, un hôte et le « mode actif ». Il ne contient AUCUNE logique de jeu :
// chaque mode garde sa propre salle (api/whois.js, api/wordle.js…). Le groupe se contente de mémoriser
// quel mode est actif et le code de la salle de ce mode ; les clients s'y inscrivent eux-mêmes avec leur profil.
const Redis = require('ioredis');

const ROOM_TTL_SECONDS = 60 * 60 * 6;
const PRESENCE_SECONDS = 45;          // un membre sans nouvelle depuis 45 s est « absent »
const MAX_MEMBERS = 16;
const MODES = ['whois', 'wordle'];    // modes gérés par le groupe (la Devinette viendra plus tard)
const MAX_DEX_ID = 1025;

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}
const roomKey = code => `party:room:${code}`;
const lockKey = code => `party:lock:${code}`;
const seenKey = (code, pid) => `party:seen:${code}:${pid}`;

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
const cleanCode = v => (v || '').toString().trim().toUpperCase();
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
async function getRoom(code) {
  const raw = await getRedis().get(roomKey(code));
  return raw ? JSON.parse(raw) : null;
}
async function saveRoom(code, room) {
  room.updatedAt = Date.now();
  await getRedis().set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}
async function touch(code, pid) { try { await getRedis().set(seenKey(code, pid), '1', 'EX', PRESENCE_SECONDS); } catch (e) {} }
async function presence(code, room) {
  const pids = Object.keys(room.members);
  const vals = pids.length ? await getRedis().mget(pids.map(p => seenKey(code, p))) : [];
  const out = {};
  pids.forEach((p, i) => { out[p] = !!vals[i]; });
  return out;
}

function view(room, playerId, here) {
  return {
    code: room.code, hostId: room.hostId, isHost: playerId === room.hostId,
    mode: room.mode, modeCode: room.modeCode, modeSeq: room.modeSeq,
    members: Object.keys(room.members).map(pid => ({
      id: pid, name: room.members[pid].name, avatar: room.members[pid].avatar || null,
      card: room.members[pid].card || null, away: !here[pid]
    })),
    now: Date.now()
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    if (req.method === 'GET') {
      const code = cleanCode(req.query.code);
      const playerId = (req.query.playerId || '').toString();
      if (!code) { res.status(400).json({ error: 'Code manquant' }); return; }
      let room = await getRoom(code);
      if (!room) { res.status(404).json({ error: 'Groupe introuvable' }); return; }
      if (!room.members[playerId]) { res.status(403).json({ error: 'Tu ne fais pas partie de ce groupe' }); return; }
      await touch(code, playerId);
      let here = await presence(code, room);
      // Hôte parti sans quitter (onglet fermé) : le premier membre présent qui interroge reprend le rôle.
      if (!here[room.hostId] && Date.now() - room.createdAt > 60000) {
        room = await withLock(code, async () => {
          const fresh = await getRoom(code);
          if (!fresh) return null;
          const hostHere = fresh.members[fresh.hostId] && (await getRedis().get(seenKey(code, fresh.hostId)));
          if (!hostHere) { fresh.hostId = playerId; await saveRoom(code, fresh); }
          return fresh;
        });
        if (!room) { res.status(404).json({ error: 'Groupe introuvable' }); return; }
        here = await presence(code, room);
      }
      res.status(200).json(view(room, playerId, here));
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
        const playerId = 'g_' + Math.random().toString(36).slice(2, 9);
        const room = {
          code, createdAt: Date.now(), hostId: playerId, mode: null, modeCode: null, modeSeq: 0,
          members: { [playerId]: { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) } }
        };
        await saveRoom(code, room);
        await touch(code, playerId);
        res.status(200).json({ code, playerId });
        return;
      }

      if (action === 'join') {
        const code = cleanCode(body.code);
        const name = (body.name || '').toString().trim().slice(0, 16);
        if (!code || !name) { res.status(400).json({ error: 'Code ou pseudo manquant' }); return; }
        const out = await withLock(code, async () => {
          const room = await getRoom(code);
          if (!room) return { status: 404, body: { error: 'Groupe introuvable' } };
          if (Object.keys(room.members).length >= MAX_MEMBERS) return { status: 400, body: { error: 'Groupe complet' } };
          const playerId = 'g_' + Math.random().toString(36).slice(2, 9);
          room.members[playerId] = { name, avatar: cleanAvatar(body.avatar), card: cleanCard(body.card) };
          await saveRoom(code, room);
          await touch(code, playerId);
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
        if (!room || !room.members[playerId]) return { status: 404, body: { error: 'Groupe ou membre introuvable' } };
        const here = () => presence(code, room);

        // Choisir le mode actif (hôte seul) : le client de l'hôte a déjà créé la salle du mode et donne son code.
        if (action === 'setmode') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut changer de mode" } };
          const mode = (body.mode || '').toString();
          const modeCode = cleanCode(body.modeCode);
          if (MODES.indexOf(mode) < 0 || !/^[A-Z0-9]{5}$/.test(modeCode)) return { status: 400, body: { error: 'Mode invalide' } };
          room.mode = mode; room.modeCode = modeCode; room.modeSeq = (room.modeSeq || 0) + 1;
          await saveRoom(code, room);
          return { status: 200, body: view(room, playerId, await here()) };
        }

        if (action === 'card') {
          room.members[playerId].card = cleanCard(body.card);
          await saveRoom(code, room);
          return { status: 200, body: { ok: true } };
        }

        if (action === 'leave') {
          delete room.members[playerId];
          const left = Object.keys(room.members);
          if (!left.length) { await getRedis().del(roomKey(code)); return { status: 200, body: { ok: true } }; }
          if (room.hostId === playerId) room.hostId = left[0];
          await saveRoom(code, room);
          return { status: 200, body: { ok: true } };
        }

        if (action === 'kick') {
          if (room.hostId !== playerId) return { status: 403, body: { error: "Seul l'hôte peut exclure un membre" } };
          if (body.targetPlayerId === playerId || !room.members[body.targetPlayerId]) return { status: 400, body: { error: 'Membre invalide' } };
          delete room.members[body.targetPlayerId];
          await saveRoom(code, room);
          return { status: 200, body: view(room, playerId, await here()) };
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
