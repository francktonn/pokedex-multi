// Fonction serverless Vercel : « Créateur ». Tableau de bord pour personnaliser le site sans le republier :
//   • le bloc-note (onglets, cases : ajouter, renommer, masquer, réordonner)
//   • les infos des Pokémon (nom, types, génération, taille/poids, stats, talents, famille d'évolution)
//
// Sécurité : l'accès est protégé par un code secret, à définir dans la variable d'environnement ADMIN_CODE (Vercel →
// Settings → Environment Variables). Le code n'est jamais écrit dans le site. Une connexion réussie délivre un jeton
// aléatoire valable 12 h ; toutes les écritures exigent ce jeton. Les essais de code sont limités (10 / 15 min / adresse).
//
//   GET  /api/admin                       -> { rev, notepad, pokemon, now }   (public : lu par tous les joueurs)
//   POST /api/admin {action:'login', code}                   -> { token }
//   POST /api/admin {action:'verify', token}                 -> { ok:true }
//   POST /api/admin {action:'logout', token}                 -> { ok:true }
//   POST /api/admin {action:'save_notepad', token, notepad}  -> { ok:true, rev }     (notepad:null = valeurs par défaut)
//   POST /api/admin {action:'save_pokemon', token, entries:[{id,data}]}              (data:null = supprimer la modification)
const Redis = require('ioredis');
const crypto = require('crypto');

const NOTEPAD_KEY = 'site:notepad';
const POKEMON_KEY = 'site:pokemon';
const REV_KEY = 'site:rev';
const TOKEN_TTL = 60 * 60 * 12;
const MAX_FAILS = 10, FAIL_WINDOW = 15 * 60;
const MAX_CATS = 40, MAX_ITEMS = 300, MAX_POKEMON = 800, MAX_BYTES = 150000;
const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

let redisClient = null;
function getRedis() {
  if (!redisClient) {
    if (!process.env.REDIS_URL) throw new Error("Variable d'environnement REDIS_URL manquante");
    redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redisClient;
}

const sha = v => crypto.createHash('sha256').update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const parse = raw => { try { return JSON.parse(raw); } catch (e) { return null; } };
const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const bool = v => v === true;
const idOk = v => typeof v === 'string' && /^[A-Za-z0-9_:\-]{1,40}$/.test(v);
const intIn = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

// ---------- Bloc-note ----------
// Structure : { categories: [ { key, label, custom?, hidden?, items: [ { id, label, custom?, hidden? } ] } ] }
function cleanNotepad(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.categories)) return { error: 'Bloc-note invalide' };
  if (v.categories.length > MAX_CATS) return { error: 'Trop d\'onglets (' + MAX_CATS + ' maximum)' };
  const seenCat = {}, seenItem = {}, categories = [];
  for (const c of v.categories) {
    if (!c || !idOk(c.key) || seenCat[c.key]) continue;
    seenCat[c.key] = true;
    const custom = bool(c.custom);
    const label = text(c.label, 30);
    if (custom && !label) return { error: 'Un onglet n\'a pas de nom' };
    const items = [];
    if (!Array.isArray(c.items)) c.items = [];
    if (c.items.length > MAX_ITEMS) return { error: 'Trop de cases dans « ' + label + ' » (' + MAX_ITEMS + ' maximum)' };
    for (const it of c.items) {
      if (!it || !idOk(it.id) || seenItem[it.id]) continue;
      seenItem[it.id] = true;
      const icustom = bool(it.custom), il = text(it.label, 40);
      if (icustom && !il) return { error: 'Une case n\'a pas de nom' };
      items.push({ id: it.id, label: il, custom: icustom, hidden: bool(it.hidden) });
    }
    categories.push({ key: c.key, label, custom, hidden: bool(c.hidden), items });
  }
  const out = { categories };
  if (JSON.stringify(out).length > MAX_BYTES) return { error: 'Configuration trop volumineuse' };
  return { value: out };
}

// ---------- Pokémon ----------
// Seuls les champs modifiés sont enregistrés : { name, types:[…], generation, heightM, weightKg, stats:{…}, abilities:[{name,hidden}], family:[ids] }
function cleanPokemon(v) {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  const name = text(v.name, 40); if (name) out.name = name;
  if (Array.isArray(v.types)) {
    const t = [...new Set(v.types.map(String))].filter(x => TYPES.includes(x)).slice(0, 2);
    if (t.length) out.types = t;
  }
  const g = intIn(v.generation, 1, 9); if (g) out.generation = g;
  const h = Number(v.heightM); if (v.heightM !== '' && v.heightM != null && Number.isFinite(h) && h > 0 && h <= 1000) out.heightM = Math.round(h * 10) / 10;
  const w = Number(v.weightKg); if (v.weightKg !== '' && v.weightKg != null && Number.isFinite(w) && w > 0 && w <= 100000) out.weightKg = Math.round(w * 10) / 10;
  if (v.stats && typeof v.stats === 'object') {
    const s = {};
    STAT_KEYS.forEach(k => { const n = intIn(v.stats[k], 1, 999); if (n != null) s[k] = n; });
    if (Object.keys(s).length) out.stats = s;
  }
  if (Array.isArray(v.abilities)) {
    const a = v.abilities.map(x => ({ name: text(x && x.name, 40), hidden: bool(x && x.hidden) })).filter(x => x.name).slice(0, 4);
    if (a.length) out.abilities = a;
  }
  if (Array.isArray(v.family)) {
    const f = [...new Set(v.family.map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= 1025).slice(0, 6);
    if (f.length) out.family = f;
  }
  return out;
}

async function bump(r) { return r.incr(REV_KEY); }

async function readConfig(r) {
  const [np, all, rev] = await Promise.all([r.get(NOTEPAD_KEY), r.hgetall(POKEMON_KEY), r.get(REV_KEY)]);
  const pokemon = {};
  Object.keys(all || {}).forEach(id => { const p = parse(all[id]); if (p && typeof p === 'object') pokemon[id] = p; });
  return { rev: Number(rev) || 0, notepad: np ? parse(np) : null, pokemon, now: Date.now() };
}

async function authed(r, token) {
  token = (token || '').toString();
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  const k = 'admin:tok:' + token;
  if (!(await r.exists(k))) return false;
  await r.expire(k, TOKEN_TTL);
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const r = getRedis();
    if (req.method === 'GET') { res.status(200).json(await readConfig(r)); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const action = (body.action || '').toString();

    if (action === 'login') {
      const secret = process.env.ADMIN_CODE;
      if (!secret) { res.status(503).json({ error: "Aucun code créateur n'est configuré : ajoute la variable ADMIN_CODE sur Vercel." }); return; }
      const ip = ((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'local').toString().split(',')[0].trim().slice(0, 60);
      const failKey = 'admin:fail:' + ip;
      const fails = Number(await r.get(failKey)) || 0;
      if (fails >= MAX_FAILS) { res.status(429).json({ error: 'Trop d\'essais : réessaie dans quelques minutes.' }); return; }
      if (!safeEqual((body.code || '').toString(), secret)) {
        await r.incr(failKey); await r.expire(failKey, FAIL_WINDOW);
        res.status(401).json({ error: 'Code incorrect' }); return;
      }
      await r.del(failKey);
      const token = crypto.randomBytes(24).toString('hex');
      await r.set('admin:tok:' + token, '1', 'EX', TOKEN_TTL);
      res.status(200).json({ token });
      return;
    }

    if (action === 'verify') { res.status(200).json({ ok: await authed(r, body.token) }); return; }
    if (action === 'logout') { const t = (body.token || '').toString(); if (/^[a-f0-9]{48}$/.test(t)) await r.del('admin:tok:' + t); res.status(200).json({ ok: true }); return; }

    // Toutes les actions suivantes écrivent : jeton obligatoire.
    if (!(await authed(r, body.token))) { res.status(401).json({ error: 'Session expirée : reconnecte-toi.' }); return; }

    if (action === 'save_notepad') {
      if (body.notepad === null) { await r.del(NOTEPAD_KEY); res.status(200).json({ ok: true, rev: await bump(r) }); return; }
      const c = cleanNotepad(body.notepad);
      if (c.error) { res.status(400).json({ error: c.error }); return; }
      await r.set(NOTEPAD_KEY, JSON.stringify(c.value));
      res.status(200).json({ ok: true, rev: await bump(r) });
      return;
    }

    if (action === 'save_pokemon') {
      const entries = Array.isArray(body.entries) ? body.entries : (body.id != null ? [{ id: body.id, data: body.data }] : []);
      if (!entries.length || entries.length > 12) { res.status(400).json({ error: 'Requête invalide' }); return; }
      for (const e of entries) {
        const id = intIn(e && e.id, 1, 20000);
        if (id == null) { res.status(400).json({ error: 'Numéro de Pokémon invalide' }); return; }
        const data = e.data == null ? null : cleanPokemon(e.data);
        if (!data || !Object.keys(data).length) { await r.hdel(POKEMON_KEY, String(id)); continue; }
        if (!(await r.hexists(POKEMON_KEY, String(id))) && (await r.hlen(POKEMON_KEY)) >= MAX_POKEMON) { res.status(409).json({ error: 'Trop de Pokémon modifiés' }); return; }
        await r.hset(POKEMON_KEY, String(id), JSON.stringify(data));
      }
      res.status(200).json({ ok: true, rev: await bump(r) });
      return;
    }

    res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Erreur serveur' });
  }
};
