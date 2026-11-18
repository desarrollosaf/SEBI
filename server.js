'use strict';
// SEBI — Sistema de Enajenación de Bienes Informáticos
// Servidor sin dependencias externas: node server.js
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const url = require('url');

const store = require('./lib/store');
const { CLASIFICACIONES_DEFAULT, clasificar, normalizar, sinSerie, normalizarSerie, homologarMarca } = require('./lib/clasificar');
const { importarExcel, normInv } = require('./lib/importar');
const docx = require('./lib/docx');
const exportar = require('./lib/exportar');
const N = require('./lib/numeros');

const RAIZ = __dirname;
const DATA = process.env.SEBI_DATA || path.join(RAIZ, 'data');
const PUERTO_HTTP = Number(process.env.SEBI_HTTP || 8080);
const PUERTO_HTTPS = Number(process.env.SEBI_HTTPS || 8443);
// Prefijo de publicación opcional, p. ej. SEBI_BASE=/sebi  →  http://servidor/sebi/
const BASE = ('/' + (process.env.SEBI_BASE || '')).replace(/\/+$/, '').replace(/^\/+/, '/').replace(/^\/$/, '');
const CERT_DIR = process.env.SEBI_CERT_DIR || path.join(RAIZ, 'cert');
const VERSION = '1.3.0';

const db = store.abrir(DATA);

// ---------- Configuración por omisión ----------
function configDefault() {
  return {
    institucion: { nombre: 'Poder Legislativo del Estado de México', area: 'Dirección de Informática', bodega: 'BODEGA DE INFORMÁTICA' },
    clasificaciones: CLASIFICACIONES_DEFAULT.map(c => ({ ...c })),
    lotePlantilla: {
      firmante: { titulo: '', nombre: 'JUAN JOSÉ DOMÍNGUEZ OROZCO', cargo: 'DIRECTOR DE INFORMÁTICA' },
      perito: { titulo: 'Mtro.', nombre: 'Juan José Domínguez Orozco', cargo: 'DIRECTOR DE INFORMÁTICA', cargoLargo: 'Director de Informática' },
      oficio: { destinatarioTitulo: 'MAESTRO', destinatario: 'LUIS DAVID MIRANDA GÓMEZ', destinatarioCargo: 'SECRETARIO DE ADMINISTRACIÓN Y FINANZAS', ccp: ['L.C. y F. Martha Maldonado Vilchis. Directora de Recursos Materiales', 'Archivo'], iniciales: 'JJDO/eag' },
      acta: {
        lugar: 'la bodega del Departamento de Bienes Muebles adscrito a la Dirección de Recursos Materiales de la Secretaría de Administración y Finanzas, ubicada en avenida Sebastián Lerdo de Tejada, poniente 829, Barrio de San Bernardino, código postal 50080, de esta misma demarcación',
        solicitante: 'el Secretario de Administración y Finanzas',
        adscripcionAsistentes: 'Departamento de Soporte Técnico y Telecomunicaciones',
        adscripcionAuditores: 'al Departamento de Seguimiento y Evaluación y a la Dirección de Auditoría Interna',
        designadoPor: 'Mtro. Luis David Miranda Gómez', designadoPorCargo: 'Secretario de Administración y Finanzas',
        asistentes: [], auditores: [],
      },
      avaluo: { fojas: '', lugar: 'la bodega del Departamento de Bienes Muebles adscrito a la Dirección de Recursos Materiales de la Secretaría de Administración y Finanzas del Poder Legislativo, ubicado en Av. Sebastián Lerdo de Tejada número 829 poniente, Barrio de San Bernardino, Toluca, Estado de México' },
    },
    etiqueta: { titulo: 'ENAJENACIÓN DE BIENES INFORMÁTICOS', subtitulo: 'Dirección de Informática · Poder Legislativo del Estado de México' },
    textos: {},
  };
}
if (!db.config.datos || !db.config.datos.clasificaciones) { db.config.datos = { ...configDefault(), ...(db.config.datos || {}) }; db.config.guardar(true); }
const config = () => db.config.datos;
// Agrega clasificaciones nuevas de versiones posteriores (una sola vez)
if ((db.config.datos.versionClases || 1) < 2) {
  const cl = db.config.datos.clasificaciones;
  for (const d of CLASIFICACIONES_DEFAULT) if (!cl.some(c => c.clave === d.clave)) { const i = cl.findIndex(c => c.clave === 'OTRO'); cl.splice(i < 0 ? cl.length : i, 0, { ...d }); }
  db.config.datos.versionClases = 2; db.config.guardar(true);
}

// ---------- Usuarios y sesiones ----------
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return { salt, hash: h };
}
function verificarPassword(pw, u) {
  if (!u || !u.salt || !u.hash) return false;
  const h = crypto.scryptSync(String(pw), u.salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'));
}
if (!db.usuarios.datos.length) {
  const { salt, hash } = hashPassword('admin');
  db.usuarios.datos.push({ id: store.nuevoId('u'), usuario: 'admin', nombre: 'Administrador', rol: 'admin', salt, hash, activo: true, cambiarPassword: true, creado: new Date().toISOString() });
  db.usuarios.guardar(true);
  console.log('Usuario inicial creado: admin / admin (cámbialo al entrar)');
}
const publico = u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo !== false, cambiarPassword: !!u.cambiarPassword, creado: u.creado, ultimoAcceso: u.ultimoAcceso });

function bitacora(usuario, accion, detalle, extra) {
  db.bitacora.datos.push({ fecha: new Date().toISOString(), usuario: usuario ? usuario.usuario : '-', nombre: usuario ? usuario.nombre : '-', accion, detalle: detalle || '', ...(extra || {}) });
  if (db.bitacora.datos.length > 20000) db.bitacora.datos.splice(0, db.bitacora.datos.length - 20000);
  db.bitacora.guardar();
}

// ---------- Catálogo en memoria (índices) ----------
const idx = { porInv: new Map(), porSerie: new Map() };
function reindexar() {
  idx.porInv.clear(); idx.porSerie.clear();
  const todos = () => db.catalogo.datos.bienes.concat(db.catalogoBni.datos.bienes);
  for (const b of db.catalogoBni.datos.bienes) { b.origen = 'BNI'; idx.porInv.set(b.inv, b); if (b.invOriginal) idx.porInv.set(normInv(b.invOriginal), b); }
  for (const b of db.catalogo.datos.bienes) {
    idx.porInv.set(b.inv, b);
    if (b.serie && !sinSerie(b.serie)) {
      const k = normalizarSerie(b.serie);
      if (!idx.porSerie.has(k)) idx.porSerie.set(k, []);
      idx.porSerie.get(k).push(b.inv);
    }
  }
}
reindexar();
const bloqueoIdx = new Map();
function reindexarBloqueos() { bloqueoIdx.clear(); for (const b of db.bloqueos.datos) bloqueoIdx.set(b.codigo, b); }
reindexarBloqueos();
const normCodigo = normInv;
const catalogoCompleto = () => db.catalogo.datos.bienes.concat(db.catalogoBni.datos.bienes);
function alertaBloqueo(codigo) {
  const b = bloqueoIdx.get(normCodigo(codigo));
  if (!b) return null;
  return { nivel: 'rojo', codigo: 'LISTA_BLOQUEO', bloquea: true, motivo: b.motivo || '', texto: `EN LISTA DE BLOQUEO${b.motivo ? ': ' + b.motivo : ''} (agregado por ${b.agregadoNombre || b.agregadoPor} el ${fechaCorta(b.fecha)})` };
}
const esBodega = resg => normalizar(resg).includes(normalizar(config().institucion.bodega || 'BODEGA DE INFORMATICA'));

// ---------- Alertas ----------
function alertasInventario(inv, loteId, itemId, serieCapturada) {
  const al = [];
  const abl = alertaBloqueo(inv); if (abl) al.push(abl);
  const b = idx.porInv.get(normInv(inv));
  if (!b) { al.push({ nivel: 'amarillo', codigo: 'NO_EXISTE', texto: /^BNI/.test(normInv(inv)) ? 'No existe en el catálogo de bienes de bajo costo (BNI)' : 'No existe en el catálogo del sistema de Bienes Muebles' }); }
  else {
    const cond = normalizar(b.cond);
    const motivo = String(b.motivoBaja || '').trim();
    const enajenado = String(b.enaj || '') === '1' || /ENAJEN/i.test(normalizar(motivo));
    const deBaja = cond.includes('BAJA') || enajenado || !!motivo || !!String(b.polBaja || '').trim();
    if (deBaja) al.push({ nivel: 'rojo', codigo: 'BAJA', bloquea: true, texto: `${enajenado ? 'YA ENAJENADO / DADO DE BAJA' : 'DADO DE BAJA'} en el sistema${motivo || b.polBaja || b.fpolBaja ? ' (' + [motivo, b.polBaja ? 'póliza ' + b.polBaja : '', b.fpolBaja || ''].filter(Boolean).join(', ') + ')' : ''}` });
    else if (cond.includes('FUNCIONANDO')) al.push({ nivel: 'amarillo', codigo: 'FUNCIONANDO', texto: 'Registrado como "Funcionando" en el sistema' });
    else if (cond.includes('INVESTIGACION') || cond.includes('PENDIENTE') || cond.includes('DESCONOCE')) al.push({ nivel: 'azul', codigo: 'CONDICION', texto: `Condición en sistema: ${b.cond}` });
    if (b.resg && !esBodega(b.resg)) al.push({ nivel: 'amarillo', codigo: 'OTRO_RESGUARDO', destacar: true, resguardante: b.resg, adscripcion: b.ads || '', texto: `A resguardo de ${b.resg}${b.ads ? ' (' + b.ads + ')' : ''}, no de la bodega` });
    const partida = normalizar(b.partidaDesc);
    if (b.partida && !partida.includes('INFORM') && !partida.includes('COMPUTO') && !partida.includes('COMUNICACION')) al.push({ nivel: 'azul', codigo: 'PARTIDA', texto: `Partida: ${b.partidaDesc || b.partida}` });
    if (b.origen === 'BNI') { /* bajo costo: sin serie en el sistema */ }
    else if (sinSerie(b.serie)) al.push({ nivel: 'azul', codigo: 'SIN_SERIE', texto: 'Sin número de serie en el sistema; si el equipo trae serie física, captúrala' });
    else {
      const otros = (idx.porSerie.get(normalizarSerie(b.serie)) || []).filter(x => x !== b.inv);
      if (otros.length) al.push({ nivel: 'azul', codigo: 'SERIE_CATALOGO', texto: `La misma serie aparece en el sistema con inventario ${otros.join(', ')}` });
      if (serieCapturada && !sinSerie(serieCapturada) && normalizarSerie(serieCapturada) !== normalizarSerie(b.serie)) al.push({ nivel: 'azul', codigo: 'SERIE_DIFERENTE', texto: `La serie capturada (${serieCapturada}) no coincide con la del sistema (${b.serie})` });
    }
  }
  const invN = normInv(inv);
  for (const it of db.items.datos) {
    if (it.id === itemId || it.tipoItem === 'NR' || normInv(it.tipoItem === 'BNI' ? it.bni : it.inv) !== invN) continue;
    const lote = db.lotes.datos.find(l => l.id === it.loteId);
    if (it.loteId === loteId) al.push({ nivel: 'rojo', codigo: 'YA_EN_LOTE', bloquea: true, texto: `YA FUE CAPTURADO en este lote por ${it.capturadoNombre || it.capturadoPor || '?'} el ${fechaCorta(it.fechaCaptura)}${it.excluido ? ' (está excluido: reincorpóralo desde Bienes del lote)' : ''}` });
    else al.push({ nivel: 'amarillo', codigo: 'EN_OTRO_LOTE', texto: `Incluido en el lote "${lote ? lote.nombre : it.loteId}"` });
  }
  const serie = serieCapturada || (b && b.serie);
  if (serie && !sinSerie(serie)) {
    const k = normalizarSerie(serie);
    for (const it of db.items.datos) {
      if (it.id === itemId || it.loteId !== loteId || it.excluido) continue;
      if (it.serie && !sinSerie(it.serie) && normalizarSerie(it.serie) === k && normInv(it.inv || it.bni) !== invN) al.push({ nivel: 'rojo', codigo: 'SERIE_DUP', texto: `Misma serie que el bien ${it.inv || it.bni || ''} capturado en este lote` });
    }
  }
  return al;
}
function alertasItem(it) {
  if (it.tipoItem === 'INV') return alertasInventario(it.inv, it.loteId, it.id, it.serie);
  if (it.tipoItem === 'BNI') return alertasInventario(it.bni, it.loteId, it.id, it.serie);
  const al = [];
  if (it.serie && !sinSerie(it.serie)) {
    const k = normalizarSerie(it.serie);
    for (const o of db.items.datos) if (o.id !== it.id && o.loteId === it.loteId && !o.excluido && o.serie && normalizarSerie(o.serie) === k) al.push({ nivel: 'rojo', codigo: 'SERIE_DUP', texto: `Misma serie que ${o.inv || o.bni || o.nombre} en este lote` });
  }
  return al;
}
function fechaCorta(iso) { if (!iso) return '?'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }

function snapshotCatalogo(b) {
  if (!b) return null;
  const c = {};
  for (const k of ['nombre', 'marca', 'modelo', 'serie', 'color', 'cond', 'treg', 'valor', 'freg', 'fasig', 'resg', 'ads', 'dep', 'partida', 'partidaDesc', 'motivoBaja', 'polBaja', 'fpolBaja', 'obs', 'carac', 'cuenta', 'tvida']) if (b[k] != null) c[k] = b[k];
  return c;
}

function resumenLote(lote) {
  const its = db.items.datos.filter(i => i.loteId === lote.id);
  const act = its.filter(i => !i.excluido);
  const nr = act.filter(i => i.tipoItem === 'NR').reduce((s, i) => s + Number(i.cantidad || 1), 0);
  const prep = docx.preparar(lote, db.items.datos, config());
  return { items: its.length, inv: act.filter(i => i.tipoItem === 'INV').length, bni: act.filter(i => i.tipoItem === 'BNI').length, nr, excluidos: its.filter(i => i.excluido).length, total: prep.totales.total, importe: prep.totales.importe, fotos: its.reduce((s, i) => s + (i.fotos || []).length, 0) };
}

// ---------- Utilidades HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function leerCuerpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = []; let tam = 0;
    req.on('data', c => { tam += c.length; if (tam > limite) { reject(new HttpError(413, 'Archivo demasiado grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
function enviarJSON(res, obj, status) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
  res.end(b);
}
function enviarArchivo(res, buf, nombre, mime) {
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`, 'Cache-Control': 'no-store' });
  res.end(buf);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function sesionDe(req) {
  const sid = cookies(req).sebi_sid;
  if (!sid) return null;
  const s = db.sesiones.datos[sid];
  if (!s) return null;
  if (Date.now() - s.ultimo > 1000 * 60 * 60 * 24 * 14) { delete db.sesiones.datos[sid]; db.sesiones.guardar(); return null; }
  s.ultimo = Date.now();
  const u = db.usuarios.datos.find(x => x.id === s.usuarioId);
  if (!u || u.activo === false) return null;
  return { sid, usuario: u };
}
const limpiarNombreArchivo = s => String(s || '').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, '_');

// ---------- Rutas ----------
const rutas = [];
function ruta(metodo, patron, manejador, opciones) {
  const claves = [];
  const re = new RegExp('^' + patron.replace(/:(\w+)/g, (m, k) => { claves.push(k); return '([^/]+)'; }) + '/?$');
  rutas.push({ metodo, re, claves, manejador, opciones: opciones || {} });
}

// --- Autenticación
ruta('POST', '/api/login', async (ctx) => {
  const { usuario, password } = ctx.json;
  const u = db.usuarios.datos.find(x => x.usuario.toLowerCase() === String(usuario || '').toLowerCase().trim());
  if (!u || u.activo === false || !verificarPassword(password || '', u)) { await new Promise(r => setTimeout(r, 400)); throw new HttpError(401, 'Usuario o contraseña incorrectos'); }
  const sid = crypto.randomBytes(24).toString('hex');
  db.sesiones.datos[sid] = { usuarioId: u.id, creado: Date.now(), ultimo: Date.now() };
  db.sesiones.guardar();
  u.ultimoAcceso = new Date().toISOString(); db.usuarios.guardar();
  bitacora(u, 'login', `Inicio de sesión desde ${ctx.ip}`);
  ctx.res.setHeader('Set-Cookie', `sebi_sid=${sid}; Path=${BASE}/; HttpOnly; SameSite=Lax; Max-Age=1209600${ctx.seguro ? '; Secure' : ''}`);
  return { ok: true, usuario: publico(u) };
}, { publica: true });
ruta('POST', '/api/logout', (ctx) => { if (ctx.sesion) { delete db.sesiones.datos[ctx.sesion.sid]; db.sesiones.guardar(); } ctx.res.setHeader('Set-Cookie', `sebi_sid=; Path=${BASE}/; Max-Age=0`); return { ok: true }; }, { publica: true });
ruta('GET', '/api/yo', (ctx) => ({ usuario: publico(ctx.usuario), version: VERSION, bloqueos: db.bloqueos.datos.length, catalogo: { bienes: db.catalogo.datos.bienes.length + db.catalogoBni.datos.bienes.length, fecha: db.catalogo.datos.fecha, archivo: db.catalogo.datos.archivo } }));
ruta('PUT', '/api/yo/password', (ctx) => {
  const { actual, nueva } = ctx.json;
  if (!verificarPassword(actual || '', ctx.usuario)) throw new HttpError(400, 'La contraseña actual no es correcta');
  if (!nueva || String(nueva).length < 4) throw new HttpError(400, 'La nueva contraseña debe tener al menos 4 caracteres');
  Object.assign(ctx.usuario, hashPassword(nueva), { cambiarPassword: false }); db.usuarios.guardar();
  bitacora(ctx.usuario, 'password', 'Cambió su contraseña');
  return { ok: true };
});

// --- Usuarios (admin)
ruta('GET', '/api/usuarios', () => db.usuarios.datos.map(publico), { admin: true });
ruta('POST', '/api/usuarios', (ctx) => {
  const { usuario, nombre, rol, password } = ctx.json;
  const u = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,30}$/.test(u)) throw new HttpError(400, 'Usuario inválido (letras, números, punto, guion; 2 a 30 caracteres)');
  if (db.usuarios.datos.some(x => x.usuario === u)) throw new HttpError(400, 'Ese usuario ya existe');
  if (!password || String(password).length < 4) throw new HttpError(400, 'Contraseña mínima de 4 caracteres');
  const nu = { id: store.nuevoId('u'), usuario: u, nombre: String(nombre || u).trim(), rol: rol === 'admin' ? 'admin' : 'captura', ...hashPassword(password), activo: true, cambiarPassword: true, creado: new Date().toISOString() };
  db.usuarios.datos.push(nu); db.usuarios.guardar();
  bitacora(ctx.usuario, 'usuario_nuevo', `Creó al usuario ${u} (${nu.rol})`);
  return publico(nu);
}, { admin: true });
ruta('PUT', '/api/usuarios/:id', (ctx) => {
  const u = db.usuarios.datos.find(x => x.id === ctx.params.id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  const { nombre, rol, activo, password } = ctx.json;
  if (nombre != null) u.nombre = String(nombre).trim();
  if (rol != null && u.id !== ctx.usuario.id) u.rol = rol === 'admin' ? 'admin' : 'captura';
  if (activo != null && u.id !== ctx.usuario.id) u.activo = !!activo;
  if (password) { Object.assign(u, hashPassword(password), { cambiarPassword: true }); }
  db.usuarios.guardar();
  bitacora(ctx.usuario, 'usuario_editado', `Editó al usuario ${u.usuario}${password ? ' (restableció contraseña)' : ''}`);
  return publico(u);
}, { admin: true });

// --- Configuración
ruta('GET', '/api/config', () => config());
ruta('PUT', '/api/config', (ctx) => {
  const c = config();
  const n = ctx.json || {};
  for (const k of ['institucion', 'clasificaciones', 'lotePlantilla', 'etiqueta', 'textos']) if (n[k] != null) c[k] = n[k];
  if (Array.isArray(c.clasificaciones)) {
    c.clasificaciones = c.clasificaciones.filter(x => x && x.clave).map(x => ({ clave: String(x.clave).toUpperCase().replace(/[^A-Z0-9_]/g, '_'), nombre: x.nombre || x.clave, tipo: x.tipo || String(x.nombre || x.clave).toUpperCase(), valor: Number(x.valor || 0), patrones: Array.isArray(x.patrones) ? x.patrones : String(x.patrones || '').split('|').map(s => s.trim()).filter(Boolean) }));
    if (!c.clasificaciones.some(x => x.clave === 'OTRO')) c.clasificaciones.push({ clave: 'OTRO', nombre: 'Otro', tipo: 'OTRO', valor: 5, patrones: [] });
  }
  db.config.guardar();
  bitacora(ctx.usuario, 'config', 'Actualizó la configuración: ' + Object.keys(n).join(', '));
  return c;
}, { admin: true });
ruta('GET', '/api/config/textos-default', () => require('./lib/textos'));

// --- Catálogo
ruta('GET', '/api/catalogo/estado', () => {
  const resumen = c => {
    const b = c.datos.bienes;
    const bodega = b.filter(x => esBodega(x.resg));
    const cond = {};
    for (const x of bodega) cond[x.cond || '(sin condición)'] = (cond[x.cond || '(sin condición)'] || 0) + 1;
    return { bienes: b.length, fecha: c.datos.fecha, archivo: c.datos.archivo, enBodega: bodega.length, candidatos: bodega.filter(x => !normalizar(x.cond).includes('BAJA')).length, condicionesBodega: cond };
  };
  const inv = resumen(db.catalogo), bni = resumen(db.catalogoBni);
  return { ...inv, bni, columnas: db.catalogo.datos.columnas || [] };
});
ruta('POST', '/api/catalogo/importar', async (ctx) => {
  const buf = await leerCuerpo(ctx.req, 200 * 1024 * 1024);
  if (!buf.length) throw new HttpError(400, 'No se recibió el archivo');
  const r = importarExcel(buf, config().clasificaciones);
  const tipo = ctx.query.tipo === 'bni' || ctx.query.tipo === 'inv' ? ctx.query.tipo : (r.esBNI ? 'bni' : 'inv');
  if (tipo === 'bni' && !r.esBNI) throw new HttpError(400, 'Ese archivo no parece ser de bienes de bajo costo (la mayoría de los números no empiezan con BNI). Impórtalo como catálogo de inventariables.');
  if (tipo === 'inv' && r.esBNI) throw new HttpError(400, 'Ese archivo es de bienes de bajo costo (BNI). Impórtalo en la sección de bienes de bajo costo.');
  const col = tipo === 'bni' ? db.catalogoBni : db.catalogo;
  col.datos = { fecha: new Date().toISOString(), archivo: decodeURIComponent(ctx.req.headers['x-filename'] || 'reporte.xlsx'), bienes: r.bienes, columnas: r.columnas.map(c => c.encabezado), omitidas: r.omitidas };
  col.guardar(true);
  reindexar();
  bitacora(ctx.usuario, 'importar', `Importó el catálogo ${tipo === 'bni' ? 'de bajo costo (BNI)' : 'de inventariables'}: ${r.bienes.length} bienes desde ${col.datos.archivo}`);
  return { ok: true, tipo, bienes: r.bienes.length, omitidas: r.omitidas, columnas: r.columnas, corregidos: r.bienes.filter(b => b.invOriginal).map(b => `${b.invOriginal} → ${b.inv}`) };
}, { admin: true, raw: true });
ruta('GET', '/api/catalogo/buscar', (ctx) => {
  const q = normalizar(ctx.query.q || '');
  const limite = Math.min(Number(ctx.query.limite) || 50, 500);
  const soloBodega = ctx.query.bodega === '1';
  if (!q && !soloBodega) return [];
  const res = [];
  for (const b of catalogoCompleto()) {
    if (soloBodega && !esBodega(b.resg)) continue;
    if (q) {
      const texto = normalizar([b.inv, b.nombre, b.marca, b.modelo, b.serie, b.resg, b.ads].join(' '));
      if (!q.split(' ').every(w => texto.includes(w))) continue;
    }
    res.push(b);
    if (res.length >= limite) break;
  }
  return res;
});
ruta('GET', '/api/catalogo/bien/:inv', (ctx) => {
  const b = idx.porInv.get(normInv(ctx.params.inv));
  if (!b) throw new HttpError(404, 'No existe ese número de inventario en el catálogo');
  return b;
});

// --- Lotes
const lotePublico = l => ({ ...l, resumen: resumenLote(l) });
ruta('GET', '/api/lotes', () => db.lotes.datos.map(lotePublico));
ruta('POST', '/api/lotes', (ctx) => {
  const j = ctx.json || {};
  const anio = Number(j.anio) || new Date().getFullYear();
  const numero = Number(j.numero) || (db.lotes.datos.filter(l => l.anio === anio).length + 1);
  const plantilla = JSON.parse(JSON.stringify(config().lotePlantilla || {}));
  const lote = {
    id: store.nuevoId('L'), nombre: j.nombre || `${numero}ª Enajenación ${anio}`, numero, anio, estado: 'abierto', descripcion: j.descripcion || '',
    oficio: { ...plantilla.oficio, numero: j.numeroOficio || '', fecha: new Date().toISOString().slice(0, 10) },
    firmante: plantilla.firmante || {}, perito: plantilla.perito || {}, acta: { ...plantilla.acta, fecha: '', horaInicio: '', horaFin: '' }, avaluo: plantilla.avaluo || {}, valores: {},
    creadoPor: ctx.usuario.usuario, fechaCreacion: new Date().toISOString(),
  };
  db.lotes.datos.push(lote); db.lotes.guardar();
  bitacora(ctx.usuario, 'lote_nuevo', `Creó el lote "${lote.nombre}"`, { loteId: lote.id });
  return lotePublico(lote);
});
function buscarLote(id) { const l = db.lotes.datos.find(x => x.id === id); if (!l) throw new HttpError(404, 'Lote no encontrado'); return l; }
ruta('GET', '/api/lotes/:id', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const items = db.items.datos.filter(i => i.loteId === lote.id).map(i => ({ ...i, alertas: alertasItem(i) }));
  return { lote: lotePublico(lote), items };
});
ruta('PUT', '/api/lotes/:id', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const j = ctx.json || {};
  for (const k of ['nombre', 'numero', 'anio', 'estado', 'descripcion', 'oficio', 'firmante', 'perito', 'acta', 'avaluo', 'valores']) if (j[k] != null) lote[k] = j[k];
  lote.modificadoPor = ctx.usuario.usuario; lote.fechaModificacion = new Date().toISOString();
  db.lotes.guardar();
  bitacora(ctx.usuario, 'lote_editado', `Editó el lote "${lote.nombre}" (${Object.keys(j).join(', ')})`, { loteId: lote.id });
  return lotePublico(lote);
});
ruta('DELETE', '/api/lotes/:id', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const n = db.items.datos.filter(i => i.loteId === lote.id).length;
  if (n && ctx.query.confirmar !== '1') throw new HttpError(400, `El lote tiene ${n} bienes capturados`);
  db.items.datos = db.items.datos.filter(i => i.loteId !== lote.id); db.items.guardar();
  db.lotes.datos = db.lotes.datos.filter(l => l.id !== lote.id); db.lotes.guardar();
  bitacora(ctx.usuario, 'lote_eliminado', `Eliminó el lote "${lote.nombre}" con ${n} bienes`);
  return { ok: true };
}, { admin: true });

// Consulta previa a la captura
ruta('GET', '/api/lotes/:id/consulta', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const inv = normInv(ctx.query.inv);
  if (!inv) throw new HttpError(400, 'Falta el número de inventario');
  const b = idx.porInv.get(inv) || null;
  const existente = db.items.datos.find(i => i.loteId === lote.id && i.tipoItem !== 'NR' && normInv(i.tipoItem === 'BNI' ? i.bni : i.inv) === inv) || null;
  return { codigo: inv, esBNI: /^BNI/.test(inv), bien: b, clas: b ? clasificar(b.nombre, config().clasificaciones) : null, alertas: alertasInventario(inv, lote.id, null, null), existente };
});

// --- Items
function limpiarItem(j, lote, usuario, existente) {
  const tipoItem = ['INV', 'BNI', 'NR'].includes(j.tipoItem) ? j.tipoItem : 'INV';
  const it = existente || { id: store.nuevoId('i'), loteId: lote.id, fotos: [], capturadoPor: usuario.usuario, capturadoNombre: usuario.nombre, fechaCaptura: new Date().toISOString() };
  it.tipoItem = tipoItem;
  if (tipoItem === 'INV') {
    it.inv = normInv(j.inv);
    if (!it.inv) throw new HttpError(400, 'Falta el número de inventario');
    const b = idx.porInv.get(it.inv);
    if (b && !existente) { it.nombre = j.nombre || b.nombre || ''; it.marca = j.marca != null ? j.marca : (b.marca || ''); it.modelo = j.modelo != null ? j.modelo : (b.modelo || ''); it.serie = j.serie != null && j.serie !== '' ? j.serie : (b.serie || ''); it.registro = j.registro || b.treg || ''; it.catalogo = snapshotCatalogo(b); it.enCatalogo = true; }
    else { for (const k of ['nombre', 'marca', 'modelo', 'serie', 'registro']) if (j[k] != null) it[k] = j[k]; if (!existente) { it.enCatalogo = !!b; it.catalogo = snapshotCatalogo(b); } }
  } else if (tipoItem === 'BNI') {
    it.bni = normInv(j.bni);
    if (!it.bni) throw new HttpError(400, 'Falta el número BNI');
    if (!/^BNI/.test(it.bni)) it.bni = 'BNI' + it.bni;
    const b = idx.porInv.get(it.bni);
    if (b && !existente) { it.nombre = b.nombre || ''; it.descripcion = b.nombre || ''; it.catalogo = snapshotCatalogo(b); it.enCatalogo = true; }
    else if (!existente) { it.enCatalogo = false; }
    for (const k of ['nombre', 'descripcion', 'marca', 'modelo', 'serie']) if (j[k] != null && (j[k] !== '' || existente)) it[k] = j[k];
    if (!it.nombre) throw new HttpError(400, 'Falta el nombre del bien');
  } else {
    for (const k of ['nombre', 'marca', 'modelo', 'serie']) if (j[k] != null) it[k] = j[k];
    if (!it.nombre) throw new HttpError(400, 'Falta el nombre del bien');
    it.cantidad = Math.max(1, Number(j.cantidad || it.cantidad || 1));
  }
  for (const k of ['estado', 'observaciones', 'ubicacion', 'registro']) if (j[k] != null) it[k] = j[k];
  if (!it.estado) it.estado = 'Desuso';
  if (tipoItem === 'INV' && !it.registro) it.registro = 'No circulante';
  it.clas = j.clas || it.clas || clasificar(it.nombre, config().clasificaciones);
  if (j.excluido != null) it.excluido = !!j.excluido;
  if (existente) { it.modificadoPor = usuario.usuario; it.fechaModificacion = new Date().toISOString(); }
  return it;
}
ruta('POST', '/api/lotes/:id/items', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  if (lote.estado === 'cerrado') throw new HttpError(400, 'El lote está cerrado');
  const j = ctx.json || {};
  const it = limpiarItem(j, lote, ctx.usuario, null);
  const al = alertasItem(it);
  const duras = al.filter(a => a.bloquea);
  if (duras.length) throw new HttpError(409, 'No se puede registrar: ' + duras.map(a => a.texto).join(' · '));
  const bloquea = al.filter(a => a.nivel === 'rojo');
  if (bloquea.length && !j.forzar) throw new HttpError(409, bloquea.map(a => a.texto).join(' · '));
  if (j.forzar && bloquea.length) it.forzado = bloquea.map(a => a.codigo);
  db.items.datos.push(it); db.items.guardar();
  bitacora(ctx.usuario, 'captura', `Capturó ${it.tipoItem} ${it.inv || it.bni || it.nombre}${it.tipoItem === 'NR' ? ' x' + it.cantidad : ''} en "${lote.nombre}"${bloquea.length ? ' (forzado)' : ''}`, { loteId: lote.id, itemId: it.id });
  return { ...it, alertas: al };
});
function buscarItem(id) { const it = db.items.datos.find(x => x.id === id); if (!it) throw new HttpError(404, 'Bien no encontrado'); return it; }
ruta('PUT', '/api/items/:id', (ctx) => {
  const it = buscarItem(ctx.params.id);
  const lote = buscarLote(it.loteId);
  if (lote.estado === 'cerrado' && ctx.usuario.rol !== 'admin') throw new HttpError(400, 'El lote está cerrado');
  limpiarItem({ ...it, ...ctx.json, tipoItem: it.tipoItem }, lote, ctx.usuario, it);
  db.items.guardar();
  bitacora(ctx.usuario, 'edicion', `Editó ${it.inv || it.bni || it.nombre} en "${lote.nombre}"`, { loteId: lote.id, itemId: it.id });
  return { ...it, alertas: alertasItem(it) };
});
ruta('DELETE', '/api/items/:id', (ctx) => {
  const it = buscarItem(ctx.params.id);
  const lote = buscarLote(it.loteId);
  if (lote.estado === 'cerrado' && ctx.usuario.rol !== 'admin') throw new HttpError(400, 'El lote está cerrado');
  if (ctx.usuario.rol !== 'admin' && it.capturadoPor !== ctx.usuario.usuario) throw new HttpError(403, 'Solo quien lo capturó o un administrador puede eliminarlo');
  for (const f of it.fotos || []) { try { fs.unlinkSync(path.join(DATA, 'fotos', f)); } catch (e) { /* ignorar */ } }
  db.items.datos = db.items.datos.filter(x => x.id !== it.id); db.items.guardar();
  bitacora(ctx.usuario, 'eliminacion', `Eliminó ${it.inv || it.bni || it.nombre} de "${lote.nombre}"`, { loteId: lote.id });
  return { ok: true };
});
ruta('POST', '/api/items/:id/fotos', async (ctx) => {
  const it = buscarItem(ctx.params.id);
  const buf = await leerCuerpo(ctx.req, 25 * 1024 * 1024);
  if (buf.length < 100) throw new HttpError(400, 'Imagen vacía');
  const ext = (ctx.req.headers['content-type'] || '').includes('png') ? 'png' : 'jpg';
  const nombre = `${it.id}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(DATA, 'fotos', nombre), buf);
  it.fotos = it.fotos || []; it.fotos.push(nombre);
  it.modificadoPor = ctx.usuario.usuario; it.fechaModificacion = new Date().toISOString();
  db.items.guardar();
  bitacora(ctx.usuario, 'foto', `Agregó foto a ${it.inv || it.bni || it.nombre}`, { itemId: it.id, loteId: it.loteId });
  return { ok: true, nombre, fotos: it.fotos };
}, { raw: true });
ruta('DELETE', '/api/items/:id/fotos/:nombre', (ctx) => {
  const it = buscarItem(ctx.params.id);
  const n = path.basename(ctx.params.nombre);
  it.fotos = (it.fotos || []).filter(f => f !== n);
  try { fs.unlinkSync(path.join(DATA, 'fotos', n)); } catch (e) { /* ignorar */ }
  db.items.guardar();
  return { ok: true, fotos: it.fotos };
});

// --- Lista de bloqueo: números de inventario/BNI que no se pueden registrar
function bloqueoPublico(b) {
  const c = idx.porInv.get(b.codigo);
  const capt = db.items.datos.filter(i => !i.excluido && (normCodigo(i.inv) === b.codigo || normCodigo(i.bni) === b.codigo)).map(i => { const l = db.lotes.datos.find(x => x.id === i.loteId); return l ? l.nombre : i.loteId; });
  return { ...b, enCatalogo: !!c, nombre: c ? [c.nombre, c.marca, c.modelo].filter(Boolean).join(' ') : '', cond: c ? c.cond : '', resg: c ? c.resg : '', capturadoEn: capt };
}
ruta('GET', '/api/bloqueos', () => db.bloqueos.datos.map(bloqueoPublico).reverse());
ruta('POST', '/api/bloqueos', (ctx) => {
  const j = ctx.json || {};
  const lista = (Array.isArray(j.codigos) ? j.codigos.join('\n') : String(j.codigos || '')).toUpperCase().split(/[\s,;|]+/).map(normCodigo).filter(c => c.length >= 3);
  const unicos = [...new Set(lista)];
  if (!unicos.length) throw new HttpError(400, 'No se encontraron números de inventario');
  const motivo = String(j.motivo || '').trim();
  const agregados = [], actualizados = [];
  for (const codigo of unicos) {
    const ex = db.bloqueos.datos.find(b => b.codigo === codigo);
    if (ex) { if (motivo && ex.motivo !== motivo) { ex.motivo = motivo; ex.modificadoPor = ctx.usuario.usuario; ex.fechaModificacion = new Date().toISOString(); actualizados.push(codigo); } continue; }
    db.bloqueos.datos.push({ codigo, motivo, agregadoPor: ctx.usuario.usuario, agregadoNombre: ctx.usuario.nombre, fecha: new Date().toISOString() });
    agregados.push(codigo);
  }
  db.bloqueos.guardar(); reindexarBloqueos();
  bitacora(ctx.usuario, 'bloqueo', `Agregó ${agregados.length} números a la lista de bloqueo${motivo ? ' (' + motivo + ')' : ''}: ${agregados.slice(0, 30).join(', ')}${agregados.length > 30 ? '…' : ''}`);
  const yaCapturados = unicos.filter(c => db.items.datos.some(i => !i.excluido && (normCodigo(i.inv) === c || normCodigo(i.bni) === c)));
  return { agregados: agregados.length, actualizados: actualizados.length, repetidos: unicos.length - agregados.length - actualizados.length, noEnCatalogo: unicos.filter(c => !idx.porInv.has(c) && !/^BNI/.test(c)), yaCapturados };
}, { admin: true });
ruta('POST', '/api/bloqueos/eliminar', (ctx) => {
  const cods = new Set(((ctx.json || {}).codigos || []).map(normCodigo));
  const antes = db.bloqueos.datos.length;
  db.bloqueos.datos = db.bloqueos.datos.filter(b => !cods.has(b.codigo));
  db.bloqueos.guardar(); reindexarBloqueos();
  bitacora(ctx.usuario, 'bloqueo', `Quitó ${antes - db.bloqueos.datos.length} números de la lista de bloqueo: ${[...cods].slice(0, 30).join(', ')}`);
  return { eliminados: antes - db.bloqueos.datos.length };
}, { admin: true });
ruta('GET', '/api/bloqueos/excel', (ctx) => {
  const filas = db.bloqueos.datos.map(bloqueoPublico).map(b => ({ Inventario: b.codigo, Motivo: b.motivo, 'Bien (catálogo)': b.nombre, Condición: b.cond, Resguardante: b.resg, 'Capturado en lote': b.capturadoEn.join(', '), 'Agregado por': b.agregadoPor, Fecha: b.fecha }));
  enviarArchivo(ctx.res, exportar.exportarTabla('Lista de bloqueo', filas), 'Lista de bloqueo.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return null;
});

// --- Piezas sin inventario (conteo rápido por tipo; cada usuario lleva su propio conteo)
function resumenPiezas(lote, usuario) {
  const m = new Map();
  for (const it of db.items.datos) {
    if (it.loteId !== lote.id || it.tipoItem !== 'NR' || it.excluido) continue;
    const k = normalizar(it.nombre);
    const e = m.get(k) || { nombre: String(it.nombre || '').toUpperCase().trim(), clas: it.clas, total: 0, mio: 0, porUsuario: {} };
    const c = Number(it.cantidad || 0);
    e.total += c; if (it.capturadoPor === usuario.usuario) e.mio += c;
    e.porUsuario[it.capturadoPor] = (e.porUsuario[it.capturadoPor] || 0) + c;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
ruta('GET', '/api/lotes/:id/piezas', (ctx) => ({ piezas: resumenPiezas(buscarLote(ctx.params.id), ctx.usuario) }));
ruta('POST', '/api/lotes/:id/piezas', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  if (lote.estado === 'cerrado') throw new HttpError(400, 'El lote está cerrado');
  const j = ctx.json || {};
  const nombre = String(j.nombre || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!nombre) throw new HttpError(400, 'Falta el nombre de la pieza');
  let it = db.items.datos.find(i => i.loteId === lote.id && i.tipoItem === 'NR' && !i.excluido && i.capturadoPor === ctx.usuario.usuario && normalizar(i.nombre) === normalizar(nombre));
  const actual = it ? Number(it.cantidad || 0) : 0;
  const nueva = j.cantidad != null ? Math.max(0, Math.trunc(Number(j.cantidad) || 0)) : Math.max(0, actual + Math.trunc(Number(j.delta) || 0));
  if (!it && nueva > 0) {
    it = limpiarItem({ tipoItem: 'NR', nombre, cantidad: nueva, clas: j.clas || '', estado: 'Desuso' }, lote, ctx.usuario, null);
    db.items.datos.push(it);
  } else if (it && nueva <= 0) {
    db.items.datos = db.items.datos.filter(x => x.id !== it.id);
  } else if (it) {
    it.cantidad = nueva; it.modificadoPor = ctx.usuario.usuario; it.fechaModificacion = new Date().toISOString();
  }
  db.items.guardar();
  if (nueva !== actual) bitacora(ctx.usuario, 'piezas', `${nombre}: ${actual} → ${nueva} en "${lote.nombre}"`, { loteId: lote.id });
  return { piezas: resumenPiezas(lote, ctx.usuario) };
});

// --- Verificación física (inspección): marca/desmarca un bien del lote por inventario o BNI
ruta('POST', '/api/lotes/:id/verificar', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const codigo = normInv((ctx.json || {}).codigo);
  if (!codigo) throw new HttpError(400, 'Falta el código');
  const it = db.items.datos.find(i => i.loteId === lote.id && !i.excluido && ((i.tipoItem === 'INV' && normInv(i.inv) === codigo) || (i.tipoItem === 'BNI' && normInv(i.bni) === codigo)));
  const abl = alertaBloqueo(codigo);
  if (!it) {
    const b = idx.porInv.get(codigo);
    if (abl) return { encontrado: false, bien: b || null, mensaje: `${codigo}: ${abl.texto}` };
    return { encontrado: false, bien: b || null, mensaje: b ? `${codigo} (${b.nombre}) NO está en este lote` : `${codigo} no está en el lote ni en el catálogo` };
  }
  const quitar = !!(ctx.json || {}).quitar;
  if (quitar) { it.verificado = false; delete it.verificadoPor; delete it.fechaVerificacion; }
  else if (!it.verificado) { it.verificado = true; it.verificadoPor = ctx.usuario.usuario; it.fechaVerificacion = new Date().toISOString(); }
  db.items.guardar();
  bitacora(ctx.usuario, 'verificacion', `${quitar ? 'Desmarcó' : 'Verificó'} ${codigo} en "${lote.nombre}"`, { loteId: lote.id, itemId: it.id });
  const total = db.items.datos.filter(i => i.loteId === lote.id && !i.excluido && i.tipoItem !== 'NR');
  return { encontrado: true, item: { ...it, alertas: alertasItem(it) }, yaEstaba: !quitar && it.fechaVerificacion && (Date.now() - new Date(it.fechaVerificacion).getTime() > 2000), verificados: total.filter(i => i.verificado).length, total: total.length };
});

// --- Duplicados y análisis del lote
ruta('GET', '/api/lotes/:id/analisis', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const items = db.items.datos.filter(i => i.loteId === lote.id && !i.excluido);
  const grupos = (clave, fn) => { const m = new Map(); for (const it of items) { const k = fn(it); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(it); } return [...m.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ clave: k, items: v })); };
  const porInv = grupos('inv', it => it.tipoItem === 'INV' ? String(it.inv).toUpperCase() : null);
  const porBni = grupos('bni', it => it.tipoItem === 'BNI' ? normalizar(it.bni) : null);
  const porSerie = grupos('serie', it => it.serie && !sinSerie(it.serie) ? normalizarSerie(it.serie) : null);
  const sospechosos = grupos('modelo', it => it.tipoItem !== 'NR' && (!it.serie || sinSerie(it.serie)) ? `${normalizar(it.nombre)}|${homologarMarca(it.marca)}|${normalizar(it.modelo)}` : null);
  const conAlertas = items.map(i => ({ ...i, alertas: alertasItem(i) })).filter(i => i.alertas.length);
  const porClase = {};
  for (const it of items) { const k = it.clas || 'OTRO'; porClase[k] = (porClase[k] || 0) + (it.tipoItem === 'NR' ? Number(it.cantidad || 1) : 1); }
  const sinFoto = items.filter(i => !(i.fotos || []).length).length;
  const sinClas = items.filter(i => !i.clas || i.clas === 'OTRO').length;
  const porUsuario = {};
  for (const it of items) porUsuario[it.capturadoPor] = (porUsuario[it.capturadoPor] || 0) + 1;
  return { duplicados: { porInv, porBni, porSerie, sospechosos }, conAlertas, porClase, sinFoto, sinClas, porUsuario, resumen: resumenLote(lote) };
});
ruta('GET', '/api/lotes/:id/avaluo', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const prep = docx.preparar(lote, db.items.datos, config());
  return { porClase: prep.porClase, totales: prep.totales, importeLetra: N.importeALetras(prep.totales.importe), variables: docx.variables(lote, prep, config()) };
});
ruta('GET', '/api/lotes/:id/relacion', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const prep = docx.preparar(lote, db.items.datos, config());
  return { inv: prep.inv, bni: prep.bni, nr: prep.nr, totales: prep.totales };
});

// --- Documentos
ruta('GET', '/api/lotes/:id/documento/:tipo', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const gen = { oficio: docx.generarOficio, acta: docx.generarActa, avaluo: docx.generarAvaluo }[ctx.params.tipo];
  if (!gen) throw new HttpError(404, 'Documento desconocido');
  const buf = gen(lote, db.items.datos, config());
  bitacora(ctx.usuario, 'documento', `Generó ${ctx.params.tipo} de "${lote.nombre}"`, { loteId: lote.id });
  const nombres = { oficio: 'Oficio', acta: 'Acta administrativa', avaluo: 'Avalúo' };
  enviarArchivo(ctx.res, buf, `${nombres[ctx.params.tipo]} - ${limpiarNombreArchivo(lote.nombre)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return null;
});
ruta('GET', '/api/lotes/:id/excel', (ctx) => {
  const lote = buscarLote(ctx.params.id);
  const buf = exportar.exportarLote(lote, db.items.datos, config());
  bitacora(ctx.usuario, 'documento', `Exportó Excel de "${lote.nombre}"`, { loteId: lote.id });
  enviarArchivo(ctx.res, buf, `Relación - ${limpiarNombreArchivo(lote.nombre)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return null;
});
ruta('GET', '/api/catalogo/excel', (ctx) => {
  const q = ctx.query;
  let lista = q.tipo === 'bni' ? db.catalogoBni.datos.bienes : q.tipo === 'inv' ? db.catalogo.datos.bienes : catalogoCompleto();
  if (q.bodega === '1') lista = lista.filter(b => esBodega(b.resg));
  if (q.candidatos === '1') lista = lista.filter(b => !normalizar(b.cond).includes('BAJA'));
  const filas = lista.map(b => ({ Tipo: b.origen === 'BNI' ? 'Bajo costo (BNI)' : 'Inventariable', Inventario: b.inv, Bien: b.nombre, Marca: b.marca, Modelo: b.modelo, Serie: b.serie, Color: b.color, Condición: b.cond, Registro: b.treg, 'Valor real': b.valor, 'Fecha registro': b.freg, Resguardante: b.resg, Adscripción: b.ads, Partida: b.partidaDesc, 'Motivo baja': b.motivoBaja, Clasificación: b.clas }));
  enviarArchivo(ctx.res, exportar.exportarTabla('Catálogo', filas), 'Catálogo de bienes.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return null;
});

// --- Bitácora y respaldo
ruta('GET', '/api/bitacora', (ctx) => { const lim = Math.min(Number(ctx.query.limite) || 300, 5000); const l = db.bitacora.datos; return l.slice(Math.max(0, l.length - lim)).reverse(); });
ruta('POST', '/api/respaldo', (ctx) => {
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(DATA, 'respaldos', sello);
  fs.mkdirSync(dest, { recursive: true });
  Object.values(db).forEach(c => c.flush());
  for (const f of ['usuarios.json', 'lotes.json', 'items.json', 'config.json', 'bitacora.json', 'catalogo.json', 'catalogo_bni.json', 'bloqueos.json']) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(dest, f));
  bitacora(ctx.usuario, 'respaldo', `Respaldo en ${dest}`);
  return { ok: true, carpeta: dest, nota: 'Las fotos están en la carpeta data/fotos; respáldala aparte.' };
}, { admin: true });
ruta('GET', '/api/info', () => ({ version: VERSION, node: process.version, data: DATA, ips: ipsLocales(), puertos: { http: PUERTO_HTTP, https: PUERTO_HTTPS } }));

// ---------- Servidor ----------
function ipsLocales() {
  const out = [];
  for (const [, lst] of Object.entries(os.networkInterfaces())) for (const i of lst) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

async function manejar(req, res, seguro) {
  const u = url.parse(req.url, true);
  let ruta_ = decodeURIComponent(u.pathname);
  const ip = req.socket.remoteAddress;
  try {
    if (BASE) {
      if (ruta_ === BASE || ruta_ === '/') { res.writeHead(302, { Location: BASE + '/' }); return res.end(); }
      if (!ruta_.startsWith(BASE + '/')) throw new HttpError(404, 'No existe');
      ruta_ = ruta_.slice(BASE.length);
    }
    // Fotos
    if (ruta_.startsWith('/fotos/')) {
      const ses = sesionDe(req);
      if (!ses) throw new HttpError(401, 'Sesión requerida');
      const f = path.join(DATA, 'fotos', path.basename(ruta_));
      if (!fs.existsSync(f)) throw new HttpError(404, 'No existe');
      res.writeHead(200, { 'Content-Type': f.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
      return fs.createReadStream(f).pipe(res);
    }
    // API
    if (ruta_.startsWith('/api/')) {
      const r = rutas.find(x => x.metodo === req.method && x.re.test(ruta_));
      if (!r) throw new HttpError(404, 'Ruta no encontrada');
      const sesion = sesionDe(req);
      if (!r.opciones.publica && !sesion) throw new HttpError(401, 'Sesión requerida');
      if (r.opciones.admin && sesion.usuario.rol !== 'admin') throw new HttpError(403, 'Se requiere rol de administrador');
      const m = ruta_.match(r.re);
      const params = {}; r.claves.forEach((k, i) => params[k] = m[i + 1]);
      let json = {};
      if (!r.opciones.raw && (req.method === 'POST' || req.method === 'PUT')) {
        const b = await leerCuerpo(req, 50 * 1024 * 1024);
        if (b.length) { try { json = JSON.parse(b.toString('utf8')); } catch (e) { throw new HttpError(400, 'JSON inválido'); } }
      }
      const ctx = { req, res, params, query: u.query, json, sesion, usuario: sesion && sesion.usuario, ip, seguro };
      const out = await r.manejador(ctx);
      if (out !== null && !res.headersSent) enviarJSON(res, out);
      return;
    }
    // Estáticos
    let f = ruta_ === '/' ? '/index.html' : ruta_;
    f = path.normalize(path.join(RAIZ, 'public', f));
    if (!f.startsWith(path.join(RAIZ, 'public'))) throw new HttpError(403, 'Prohibido');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { f = path.join(RAIZ, 'public', 'index.html'); }
    const ext = path.extname(f).toLowerCase();
    const mod = fs.statSync(f).mtime.toUTCString();
    if (req.headers['if-modified-since'] === mod) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Last-Modified': mod });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) enviarJSON(res, { error: e.message || 'Error interno' }, status);
    else res.end();
  }
}

const httpServer = http.createServer((req, res) => manejar(req, res, false));
httpServer.listen(PUERTO_HTTP, '0.0.0.0');

let httpsOk = false;
try {
  const key = fs.readFileSync(path.join(CERT_DIR, 'servidor.key'));
  const cert = fs.readFileSync(path.join(CERT_DIR, 'servidor.crt'));
  https.createServer({ key, cert }, (req, res) => manejar(req, res, true)).listen(PUERTO_HTTPS, '0.0.0.0');
  httpsOk = true;
} catch (e) { console.warn('No se pudo iniciar HTTPS (falta cert/servidor.key o cert/servidor.crt):', e.message); }

console.log(`\nSEBI v${VERSION} — Sistema de Enajenación de Bienes Informáticos`);
console.log('Datos en:', DATA);
console.log('\nAbre en la computadora:   http://localhost:' + PUERTO_HTTP + BASE + '/');
for (const ip of ipsLocales()) {
  console.log(`En la red (computadoras): http://${ip}:${PUERTO_HTTP}${BASE}/`);
  if (httpsOk) console.log(`En el celular (cámara):   https://${ip}:${PUERTO_HTTPS}${BASE}/   (acepta el aviso del certificado)`);
}
console.log('\nUsuario inicial: admin / admin\nCtrl+C para detener.\n');
