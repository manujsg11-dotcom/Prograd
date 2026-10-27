// Prograd · servidor de avisos (Cloudflare Worker)
// Necesita: un espacio KV enlazado con el nombre AVISOS y una tarea programada "* * * * *".
// No guarda rutinas ni pesos: solo la suscripción del móvil, la hora del aviso y el texto que manda la app.
// OJO: este archivo es una copia de referencia. Lo que está en marcha es lo que hay pegado en Cloudflare.

const CONTACTO = 'https://manujsg11-dotcom.github.io/Prograd/'; // va en la firma VAPID que piden Apple y Google
const MAX_POR_MINUTO = 45; // por debajo del límite de 50 envíos por ejecución del plan gratis

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// ---------- utilidades ----------
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = async s => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))).slice(0, 32);
const okHora = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const okTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch (e) { return false } };
const limpia = (s, n) => String(s || '').slice(0, n);

// Hora, día de la semana (0 = domingo) y fecha en la zona horaria del usuario
function ahoraEn(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hm: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute, dow: dias[p.weekday], fecha: p.year + '-' + p.month + '-' + p.day };
}

// ---------- claves VAPID: se crean solas la primera vez ----------
async function claves(env) {
  const guardadas = await env.AVISOS.get('vapid', 'json');
  if (guardadas) return guardadas;
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const nuevas = { pub: b64u(await crypto.subtle.exportKey('raw', par.publicKey)), priv: await crypto.subtle.exportKey('jwk', par.privateKey) };
  await env.AVISOS.put('vapid', JSON.stringify(nuevas));
  return nuevas;
}
async function firma(endpoint, k) {
  const aud = new URL(endpoint).origin;
  const cab = b64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64u(new TextEncoder().encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACTO })));
  const clave = await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, new TextEncoder().encode(cab + '.' + cuerpo));
  return `vapid t=${cab}.${cuerpo}.${b64u(sig)}, k=${k.pub}`;
}
// Aviso sin contenido: el móvil lo recibe y la app pide el texto con /mensaje (así no hay que cifrar nada)
async function avisa(endpoint, k, cache) {
  const aud = new URL(endpoint).origin;
  if (!cache[aud]) cache[aud] = await firma(endpoint, k);
  const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: cache[aud], TTL: '3600', Urgency: 'high', 'Content-Length': '0' } });
  return r.status;
}

// ---------- índice de suscripciones ----------
const leeIndice = async env => (await env.AVISOS.get('indice', 'json')) || {};
const guardaIndice = (env, idx) => env.AVISOS.put('indice', JSON.stringify(idx));
// Registro de lo que pasa (últimos 25 eventos). Solo guarda la hora, el tipo, el código y el principio del id.
async function anota(env, evs) {
  if (!evs.length) return;
  const log = (await env.AVISOS.get('log', 'json')) || [];
  await env.AVISOS.put('log', JSON.stringify([...evs, ...log].slice(0, 25)));
}
const evento = (tipo, id, st) => ({ t: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', tipo, quien: (id || '').slice(0, 6), ...(st ? { codigo: st } : {}) });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/' || url.pathname === '/estado') {
        const idx = await leeIndice(env);
        const log = (await env.AVISOS.get('log', 'json')) || [];
        return json({ ok: true, app: 'prograd-avisos', version: 2, usuarios: Object.keys(idx).length, registro: log });
      }
      if (url.pathname === '/clave' && req.method === 'GET') {
        return json({ clave: (await claves(env)).pub });
      }
      if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
      const body = await req.json().catch(() => ({}));

      // Alta o cambio de ajustes. Si solo cambia el texto, no toca el índice.
      if (url.pathname === '/suscribir') {
        const sub = body.sub;
        if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'Suscripción no válida' }, 400);
        if (!okHora(body.hora)) return json({ error: 'Hora no válida' }, 400);
        const tz = okTz(body.tz) ? body.tz : 'Europe/Madrid';
        const dias = Array.isArray(body.dias) ? [...new Set(body.dias.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
        const id = await sha(sub.endpoint);
        const antes = await env.AVISOS.get('u:' + id, 'json');
        const datos = { sub: { endpoint: sub.endpoint }, hora: body.hora, tz, dias, titulo: limpia(body.titulo, 80) || 'Prograd', texto: limpia(body.texto, 240), salta: limpia(body.salta, 10) };
        await env.AVISOS.put('u:' + id, JSON.stringify(datos));
        const idx = await leeIndice(env), e = idx[id];
        if (!e || e.h !== datos.hora || e.tz !== tz || String(e.d) !== String(dias)) {
          idx[id] = { h: datos.hora, tz, d: dias };
          await guardaIndice(env, idx);
          await anota(env, [evento(antes ? (e ? 'cambio' : 'recuperado') : 'alta', id)]);
        }
        return json({ ok: true, id });
      }

      // La app manda el texto actualizado (y si ya ha entrenado hoy)
      if (url.pathname === '/mensaje-nuevo') {
        if (typeof body.endpoint !== 'string') return json({ error: 'Falta la suscripción' }, 400);
        const id = await sha(body.endpoint);
        const datos = await env.AVISOS.get('u:' + id, 'json');
        if (!datos) return json({ error: 'No estás suscrito' }, 404);
        const nuevo = { ...datos, titulo: limpia(body.titulo, 80) || datos.titulo, texto: limpia(body.texto, 240), salta: limpia(body.salta, 10) };
        if (nuevo.titulo !== datos.titulo || nuevo.texto !== datos.texto || nuevo.salta !== datos.salta) await env.AVISOS.put('u:' + id, JSON.stringify(nuevo));
        return json({ ok: true });
      }

      // El móvil, al recibir el aviso, pide aquí el texto que tiene que enseñar
      if (url.pathname === '/mensaje') {
        if (typeof body.endpoint !== 'string') return json({ error: 'Falta la suscripción' }, 400);
        const datos = await env.AVISOS.get('u:' + (await sha(body.endpoint)), 'json');
        if (!datos) return json({ titulo: 'Prograd', texto: 'Abre la app para ver tu entreno de hoy.' });
        return json({ titulo: datos.titulo, texto: datos.texto || 'Abre la app para ver tu entreno de hoy.' });
      }

      // La app pregunta si sigue apuntada (para repararse sola si no)
      if (url.pathname === '/comprobar') {
        if (typeof body.endpoint !== 'string') return json({ error: 'Falta la suscripción' }, 400);
        const id = await sha(body.endpoint);
        const datos = await env.AVISOS.get('u:' + id, 'json'), idx = await leeIndice(env);
        return json({ suscrito: !!(datos && idx[id]), hora: datos ? datos.hora : null, dias: datos ? datos.dias : null });
      }

      if (url.pathname === '/baja') {
        if (typeof body.endpoint !== 'string') return json({ error: 'Falta la suscripción' }, 400);
        const id = await sha(body.endpoint);
        const idx = await leeIndice(env);
        if (idx[id]) { delete idx[id]; await guardaIndice(env, idx) }
        await env.AVISOS.delete('u:' + id);
        await anota(env, [evento('baja', id)]);
        return json({ ok: true });
      }

      // Aviso de prueba inmediato, para comprobar que llega
      if (url.pathname === '/prueba') {
        if (typeof body.endpoint !== 'string') return json({ error: 'Falta la suscripción' }, 400);
        const datos = await env.AVISOS.get('u:' + (await sha(body.endpoint)), 'json');
        if (!datos) return json({ error: 'No estás suscrito' }, 404);
        const id = await sha(body.endpoint);
        const st = await avisa(datos.sub.endpoint, await claves(env), {});
        await anota(env, [evento('prueba', id, st)]);
        return json({ ok: st >= 200 && st < 300, estado: st });
      }
      return json({ error: 'No existe' }, 404);
    } catch (e) {
      return json({ error: 'Error del servidor' }, 500);
    }
  },

  // Cada minuto: busca a quién le toca el aviso en su zona horaria y se lo manda
  async scheduled(ev, env, ctx) {
    ctx.waitUntil((async () => {
      const idx = await leeIndice(env);
      const ahora = new Date(ev.scheduledTime || Date.now());
      // Los que no cupieron el minuto anterior van primero
      const cola = (await env.AVISOS.get('cola', 'json')) || [];
      const deAhora = Object.entries(idx).filter(([, u]) => { const t = ahoraEn(u.tz, ahora); return u.h === t.hm && u.d.includes(t.dow) }).map(([id]) => id);
      const todos = [...new Set([...cola, ...deAhora])].filter(id => idx[id]);
      const toca = todos.slice(0, MAX_POR_MINUTO).map(id => [id, idx[id]]), resto = todos.slice(MAX_POR_MINUTO);
      if (resto.length || cola.length) await env.AVISOS.put('cola', JSON.stringify(resto));
      if (!toca.length) return;
      const k = await claves(env), cache = {}, evs = [], quitados = new Set();
      let borrar = false;
      for (const [id, u] of toca) {
        const datos = await env.AVISOS.get('u:' + id, 'json');
        if (!datos) { delete idx[id]; quitados.add(id); borrar = true; continue }
        if (datos.salta && datos.salta === ahoraEn(u.tz, ahora).fecha) { evs.push(evento('saltado (ya entrenó)', id)); continue }
        try {
          const st = await avisa(datos.sub.endpoint, k, cache);
          evs.push(evento('aviso', id, st));
          if (st === 404 || st === 410) { delete idx[id]; quitados.add(id); await env.AVISOS.delete('u:' + id); borrar = true; evs.push(evento('borrado (Apple dice que caducó)', id, st)) }
        } catch (e) { evs.push(evento('aviso fallido', id)) }
      }
      if (borrar) {
        // Vuelve a leer el índice para no pisar altas recientes
        const actual = await leeIndice(env);
        Object.keys(actual).forEach(x => { if (!idx[x] && !quitados.has(x)) idx[x] = actual[x] });
        await guardaIndice(env, idx);
      }
      await anota(env, evs);
    })());
  },
};
