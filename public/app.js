/* SEBI — Sistema de Enajenación de Bienes Informáticos — interfaz web */
'use strict';

// ============================================================ utilidades
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
  hijos.forEach(add);
  return el;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtFecha = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); };
const fmtDinero = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoy = () => new Date().toISOString().slice(0, 10);

async function api(metodo, ruta, cuerpo, opciones = {}) {
  const init = { method: metodo, headers: {} };
  if (cuerpo instanceof Blob) { init.body = cuerpo; init.headers['Content-Type'] = cuerpo.type || 'application/octet-stream'; if (opciones.nombre) init.headers['X-Filename'] = encodeURIComponent(opciones.nombre); }
  else if (cuerpo != null) { init.body = JSON.stringify(cuerpo); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(ruta.replace(/^\//, ''), init); // relativa: funciona también bajo un prefijo (/sebi/)
  if (r.status === 401 && !ruta.endsWith('/login')) { estado.usuario = null; irA('#/login'); throw new Error('Sesión expirada'); }
  const ct = r.headers.get('content-type') || '';
  const datos = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(datos && datos.error ? datos.error : `Error ${r.status}`);
  return datos;
}
function toast(msg, tipo) {
  const t = h('div', { class: 'toast ' + (tipo || '') }, msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3200);
}
function modal(contenido, o = {}) {
  const caja = h('div', { class: 'modal' + (o.ancho ? ' ancho' : '') }, o.titulo ? h('h2', null, o.titulo) : null, contenido);
  const fondo = h('div', { class: 'modal-fondo' }, caja);
  const cerrar = () => { fondo.remove(); if (o.alCerrar) o.alCerrar(); };
  fondo.addEventListener('click', e => { if (e.target === fondo && !o.fijo) cerrar(); });
  document.body.appendChild(fondo);
  return { cerrar, caja };
}
function sonido(tipo) {
  try {
    const ctx = sonido.ctx || (sonido.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo === 'error' ? 'square' : 'sine'; o.frequency.value = tipo === 'error' ? 220 : 880; g.gain.value = .15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (tipo === 'error' ? .6 : .12));
  } catch (e) { /* sin audio */ }
}
function avisoResguardo(a) {
  return h('div', { class: 'aviso-resguardo' }, h('div', { class: 'ar-t' }, '⚠ BIEN A RESGUARDO DE OTRA PERSONA'), h('div', { class: 'ar-n' }, a.resguardante || ''), a.adscripcion ? h('div', { class: 'ar-s' }, a.adscripcion) : null,
    h('div', { class: 'ar-s', style: { marginTop: '.4rem' } }, 'No está a nombre de la bodega de informática. Confírmalo con el resguardante o con Bienes Muebles antes de incluirlo.'));
}
const confirmar = msg => Promise.resolve(window.confirm(msg));
function descargar(ruta) { const a = h('a', { href: ruta.replace(/^\//, ''), download: '' }); document.body.appendChild(a); a.click(); a.remove(); }

// ============================================================ estado y navegación
const estado = { usuario: null, config: null, lotes: [], loteId: localStorage.getItem('sebi_lote') || null, recientes: [], catalogo: null };
function irA(hash) { if (location.hash === hash) render(); else location.hash = hash; }
window.addEventListener('hashchange', render);

const RUTAS = [
  ['#/inicio', 'Inicio'], ['#/captura', 'Captura'], ['#/lote', 'Bienes del lote'], ['#/analisis', 'Análisis'], ['#/avaluo', 'Avalúo'], ['#/documentos', 'Documentos'], ['#/catalogo', 'Catálogo'], ['#/bloqueos', 'Lista de bloqueo'],
  ['#/usuarios', 'Usuarios', 'admin'], ['#/config', 'Configuración', 'admin'], ['#/bitacora', 'Bitácora'],
];
function pintarBarra() {
  const b = $('#barra');
  b.innerHTML = '';
  const u = estado.usuario;
  const ruta = location.hash.split('/')[1] || 'inicio';
  b.appendChild(h('div', { class: 'contenido' },
    h('a', { class: 'logo', href: '#/inicio', style: { color: '#fff', textDecoration: 'none' } }, 'SEBI', h('span', null, 'Enajenación')),
    u ? h('nav', null, RUTAS.filter(r => !r[2] || u.rol === 'admin').map(r => h('a', { href: r[0], class: ('#/' + ruta) === r[0] ? 'activo' : '' }, r[1]))) : h('div', { class: 'crece' }),
    u ? h('div', { class: 'usuario' }, h('span', { title: u.usuario }, u.nombre), h('button', { onclick: cambiarPassword, title: 'Cambiar contraseña' }, '🔑'), h('button', { onclick: salir }, 'Salir')) : null,
  ));
  // Sub-barra: selector de lote
  const sb = $('#subbarra');
  sb.innerHTML = '';
  if (u && ['captura', 'lote', 'analisis', 'avaluo', 'documentos'].includes(ruta)) {
    sb.classList.remove('oculto');
    const sel = h('select', { onchange: e => { estado.loteId = e.target.value; localStorage.setItem('sebi_lote', estado.loteId); render(); } },
      estado.lotes.length ? estado.lotes.map(l => h('option', { value: l.id, selected: l.id === estado.loteId }, `${l.nombre} (${l.resumen.total} bienes${l.estado === 'cerrado' ? ', cerrado' : ''})`)) : h('option', { value: '' }, '— Sin lotes: crea uno en Inicio —'));
    sb.appendChild(h('div', { class: 'contenido' }, h('span', { class: 'peq suave' }, 'Lote:'), sel));
  } else sb.classList.add('oculto');
}
async function salir() { try { await api('POST', '/api/logout'); } catch (e) { /* ignorar */ } estado.usuario = null; irA('#/login'); }

async function cargarBase() {
  const yo = await api('GET', '/api/yo');
  estado.usuario = yo.usuario; estado.catalogo = yo.catalogo; estado.version = yo.version;
  estado.config = await api('GET', '/api/config');
  await cargarLotes();
}
async function cargarLotes() {
  estado.lotes = await api('GET', '/api/lotes');
  if (!estado.lotes.some(l => l.id === estado.loteId)) { const ab = estado.lotes.find(l => l.estado !== 'cerrado') || estado.lotes[0]; estado.loteId = ab ? ab.id : null; if (estado.loteId) localStorage.setItem('sebi_lote', estado.loteId); }
}
const loteActual = () => estado.lotes.find(l => l.id === estado.loteId) || null;
const clases = () => (estado.config && estado.config.clasificaciones) || [];
const nombreClase = k => { const c = clases().find(x => x.clave === k); return c ? c.nombre : (k || '—'); };
const esAdmin = () => estado.usuario && estado.usuario.rol === 'admin';

async function render() {
  const app = $('#app');
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const vista = partes[0] || 'inicio';
  if (!estado.usuario && vista !== 'login') {
    try { await cargarBase(); } catch (e) { pintarBarra(); app.innerHTML = ''; app.appendChild(vistaLogin()); return; }
  }
  if (vista === 'login') { pintarBarra(); app.innerHTML = ''; app.appendChild(vistaLogin()); return; }
  pintarBarra();
  app.innerHTML = '';
  app.appendChild(h('p', { class: 'suave' }, 'Cargando…'));
  try {
    const vistas = { inicio: vistaInicio, captura: vistaCaptura, lote: vistaLote, analisis: vistaAnalisis, avaluo: vistaAvaluo, documentos: vistaDocumentos, catalogo: vistaCatalogo, bloqueos: vistaBloqueos, usuarios: vistaUsuarios, config: vistaConfig, bitacora: vistaBitacora };
    const fn = vistas[vista] || vistaInicio;
    const el = await fn(partes.slice(1));
    app.innerHTML = '';
    app.appendChild(el);
    if (estado.usuario && estado.usuario.cambiarPassword && !estado.avisoPassword) { estado.avisoPassword = true; toast('Por seguridad, cambia tu contraseña (botón 🔑 arriba).', 'error'); }
  } catch (e) { app.innerHTML = ''; app.appendChild(h('div', { class: 'alerta rojo' }, 'Error: ' + e.message)); }
}

// ============================================================ login
function vistaLogin() {
  const f = h('form', { class: 'tarjeta login col', onsubmit: async e => {
    e.preventDefault();
    const btn = $('button', f); btn.disabled = true;
    try { const r = await api('POST', '/api/login', { usuario: $('[name=usuario]', f).value, password: $('[name=password]', f).value }); estado.usuario = r.usuario; await cargarBase(); irA('#/inicio'); }
    catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  } },
    h('div', { class: 'logo-grande' }, 'SEBI'),
    h('p', { class: 'centro suave' }, 'Sistema de Enajenación de Bienes Informáticos', h('br'), 'Dirección de Informática · Poder Legislativo del Estado de México'),
    h('label', { class: 'campo' }, h('span', null, 'Usuario'), h('input', { type: 'text', name: 'usuario', autocomplete: 'username', autocapitalize: 'none', required: true, autofocus: true })),
    h('label', { class: 'campo' }, h('span', null, 'Contraseña'), h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true })),
    h('button', { class: 'btn grande bloque', type: 'submit' }, 'Entrar'),
  );
  return f;
}
function cambiarPassword() {
  const f = h('form', { class: 'col', onsubmit: async e => {
    e.preventDefault();
    const n = $('[name=nueva]', f).value, c = $('[name=confirma]', f).value;
    if (n !== c) return toast('Las contraseñas no coinciden', 'error');
    try { await api('PUT', '/api/yo/password', { actual: $('[name=actual]', f).value, nueva: n }); estado.usuario.cambiarPassword = false; m.cerrar(); toast('Contraseña actualizada', 'ok'); }
    catch (err) { toast(err.message, 'error'); }
  } },
    h('label', { class: 'campo' }, h('span', null, 'Contraseña actual'), h('input', { type: 'password', name: 'actual', required: true, autocomplete: 'current-password' })),
    h('label', { class: 'campo' }, h('span', null, 'Nueva contraseña'), h('input', { type: 'password', name: 'nueva', required: true, minlength: 4, autocomplete: 'new-password' })),
    h('label', { class: 'campo' }, h('span', null, 'Confirmar nueva contraseña'), h('input', { type: 'password', name: 'confirma', required: true, autocomplete: 'new-password' })),
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn gris', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn', type: 'submit' }, 'Guardar')),
  );
  const m = modal(f, { titulo: 'Cambiar contraseña' });
}

// ============================================================ inicio
async function vistaInicio() {
  await cargarLotes();
  const cat = await api('GET', '/api/catalogo/estado');
  const cont = h('div');
  if (!cat.bienes) cont.appendChild(h('div', { class: 'alerta amarillo' }, 'Aún no se ha importado el catálogo de bienes. ', h('a', { href: '#/catalogo' }, 'Importar el Excel del sistema de Bienes Muebles'), '.'));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, 'Catálogo del sistema de Bienes Muebles'),
    h('div', { class: 'kpi' },
      h('div', null, h('b', null, cat.bienes.toLocaleString()), h('small', null, 'bienes en el catálogo')),
      h('div', null, h('b', null, cat.enBodega.toLocaleString()), h('small', null, 'en ' + (estado.config.institucion.bodega || 'bodega'))),
      h('div', null, h('b', null, cat.candidatos.toLocaleString()), h('small', null, 'en bodega sin baja definitiva')),
      h('div', null, h('b', null, cat.fecha ? new Date(cat.fecha).toLocaleDateString('es-MX') : '—'), h('small', null, 'última importación')),
    )));
  const lotes = h('div', { class: 'cuadricula' }, estado.lotes.map(l => h('div', { class: 'tarjeta', style: { marginBottom: 0 } },
    h('h3', null, l.nombre, ' ', h('span', { class: 'chip ' + (l.estado === 'cerrado' ? 'gris' : 'verde') }, l.estado === 'cerrado' ? 'Cerrado' : 'Abierto')),
    h('p', { class: 'peq suave' }, `Oficio ${l.oficio && l.oficio.numero ? l.oficio.numero : 'sin número'} · creado por ${l.creadoPor} el ${fmtFecha(l.fechaCreacion)}`),
    h('div', { class: 'kpi' },
      h('div', null, h('b', null, l.resumen.inv), h('small', null, 'inventariables')),
      h('div', null, h('b', null, l.resumen.bni), h('small', null, 'BNI')),
      h('div', null, h('b', null, l.resumen.nr), h('small', null, 'no registrados')),
      h('div', null, h('b', null, fmtDinero(l.resumen.importe)), h('small', null, 'avalúo')),
    ),
    h('div', { class: 'fila mt' },
      h('button', { class: 'btn', onclick: () => { estado.loteId = l.id; localStorage.setItem('sebi_lote', l.id); irA('#/captura'); } }, '📷 Capturar'),
      h('button', { class: 'btn sec', onclick: () => { estado.loteId = l.id; localStorage.setItem('sebi_lote', l.id); irA('#/lote'); } }, 'Ver bienes'),
      h('button', { class: 'btn sec', onclick: () => { estado.loteId = l.id; localStorage.setItem('sebi_lote', l.id); irA('#/documentos'); } }, 'Documentos'),
    ),
  )));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, 'Procesos de enajenación (lotes)', h('button', { class: 'btn', onclick: nuevoLote }, '+ Nuevo lote')), estado.lotes.length ? lotes : h('p', { class: 'suave' }, 'No hay lotes. Crea el primero para empezar a capturar.')));
  cont.appendChild(h('div', { class: 'tarjeta ayuda' }, h('b', null, '¿Cómo se usa?'), h('ol', { class: 'peq', style: { margin: '.4rem 0 0 1rem', padding: 0 } },
    h('li', null, 'Importa el Excel del sistema de Bienes Muebles en ', h('a', { href: '#/catalogo' }, 'Catálogo'), ' (una vez; vuelve a importarlo cuando haya un reporte nuevo).'),
    h('li', null, 'Crea un lote (p. ej. "2ª Enajenación 2026").'),
    h('li', null, 'En bodega, abre ', h('b', null, 'Captura'), ' desde el celular: escanea la etiqueta, revisa las alertas, toma la foto y guarda.'),
    h('li', null, 'Revisa duplicados y alertas en ', h('b', null, 'Análisis'), ', ajusta valores en ', h('b', null, 'Avalúo'), ' y genera Oficio, Acta, Avalúo, Excel y etiquetas en ', h('b', null, 'Documentos'), '.'),
  )));
  cont.appendChild(h('p', { class: 'version' }, `SEBI versión ${estado.version || ''}`));
  return cont;
}
function nuevoLote() {
  const anio = new Date().getFullYear();
  const n = estado.lotes.filter(l => l.anio === anio).length + 1;
  const f = h('form', { class: 'col', onsubmit: async e => {
    e.preventDefault();
    try { const l = await api('POST', '/api/lotes', { nombre: $('[name=nombre]', f).value, numero: Number($('[name=numero]', f).value), anio: Number($('[name=anio]', f).value), numeroOficio: $('[name=oficio]', f).value }); m.cerrar(); estado.loteId = l.id; localStorage.setItem('sebi_lote', l.id); await cargarLotes(); toast('Lote creado', 'ok'); irA('#/captura'); }
    catch (err) { toast(err.message, 'error'); }
  } },
    h('div', { class: 'grid2' },
      h('label', { class: 'campo' }, h('span', null, 'Número de enajenación'), h('input', { type: 'number', name: 'numero', value: n, min: 1, oninput: e => { $('[name=nombre]', f).value = `${e.target.value}ª Enajenación ${$('[name=anio]', f).value}`; } })),
      h('label', { class: 'campo' }, h('span', null, 'Año'), h('input', { type: 'number', name: 'anio', value: anio, oninput: e => { $('[name=nombre]', f).value = `${$('[name=numero]', f).value}ª Enajenación ${e.target.value}`; } })),
    ),
    h('label', { class: 'campo' }, h('span', null, 'Nombre del lote'), h('input', { type: 'text', name: 'nombre', value: `${n}ª Enajenación ${anio}`, required: true })),
    h('label', { class: 'campo' }, h('span', null, 'Número de oficio (se puede poner después)'), h('input', { type: 'text', name: 'oficio', placeholder: '48001/622/2026' })),
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn gris', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn', type: 'submit' }, 'Crear lote')),
  );
  const m = modal(f, { titulo: 'Nuevo proceso de enajenación' });
}

// ============================================================ cámara y escáner
let camaraActiva = null;
function detenerCamara() { if (camaraActiva) { camaraActiva.getTracks().forEach(t => t.stop()); camaraActiva = null; } }
function comprimirImagen(fuente, max = 1400, calidad = .82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const esc_ = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', calidad);
      if (fuente instanceof Blob) URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Imagen inválida'));
    img.src = fuente instanceof Blob ? URL.createObjectURL(fuente) : fuente;
  });
}
/** Abre la cámara (celular o webcam) para tomar una foto. Devuelve Promise<Blob|null>. */
function tomarFoto(titulo) {
  return new Promise(resolve => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
      // Sin cámara en vivo (p. ej. http en celular): usar el selector/cámara nativa
      const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
      inp.onchange = async () => { const f = inp.files[0]; inp.remove(); resolve(f ? await comprimirImagen(f) : null); };
      document.body.appendChild(inp); inp.click();
      return;
    }
    const video = h('video', { autoplay: true, playsinline: true, muted: true });
    let dispositivos = [], idxDisp = 0, usandoFacing = true;
    const cont = h('div', { class: 'col' },
      h('div', { class: 'camara' }, video),
      h('div', { class: 'acciones', style: { justifyContent: 'space-between' } },
        h('div', { class: 'fila' },
          h('button', { type: 'button', class: 'btn gris', onclick: () => cambiar() }, '🔄 Cambiar cámara'),
          h('button', { type: 'button', class: 'btn gris', onclick: () => { const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }); inp.onchange = async () => { const f = inp.files[0]; if (f) { cerrar(await comprimirImagen(f)); } }; document.body.appendChild(inp); inp.click(); } }, '📁 Archivo')),
        h('div', { class: 'fila' },
          h('button', { type: 'button', class: 'btn gris', onclick: () => cerrar(null) }, 'Cancelar'),
          h('button', { type: 'button', class: 'btn grande', onclick: capturar }, '📸 Capturar'))),
    );
    const m = modal(cont, { titulo: titulo || 'Tomar foto', fijo: true });
    const cerrar = v => { detenerCamara(); m.cerrar(); resolve(v); };
    async function iniciar(constraints) {
      detenerCamara();
      try { camaraActiva = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false }); video.srcObject = camaraActiva; }
      catch (e) { toast('No se pudo abrir la cámara: ' + e.message, 'error'); }
    }
    async function cambiar() {
      try { dispositivos = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { dispositivos = []; }
      if (dispositivos.length < 2) return toast('Solo hay una cámara disponible');
      if (usandoFacing) { usandoFacing = false; idxDisp = 0; } else idxDisp = (idxDisp + 1) % dispositivos.length;
      iniciar({ deviceId: { exact: dispositivos[idxDisp].deviceId } });
    }
    function capturar() {
      if (!video.videoWidth) return toast('La cámara aún no está lista');
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(async b => cerrar(await comprimirImagen(b)), 'image/jpeg', .92);
    }
    iniciar({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } });
  });
}
let ultimaFotoEscaneo = null;
async function capturarFrame(cont) {
  try {
    const v = cont.querySelector('video'); if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
    return b ? await comprimirImagen(b, 1600) : null;
  } catch (e) { return null; }
}
/** Escáner de código de barras / QR. Devuelve Promise<string|null>; deja en ultimaFotoEscaneo la imagen del momento de la lectura. */
function escanear(opciones = {}) {
  ultimaFotoEscaneo = null;
  return new Promise(resolve => {
    if (!window.Html5Qrcode || !navigator.mediaDevices || !window.isSecureContext) {
      toast(window.isSecureContext ? 'El escáner no está disponible en este navegador' : 'Para escanear desde el celular abre la dirección https:// (ver Inicio)', 'error');
      return resolve(null);
    }
    const lector = h('div', { id: 'lector' });
    const estadoTxt = h('p', { class: 'peq suave centro' }, 'Apunta la cámara al código de barras o QR de la etiqueta');
    const cont = h('div', { class: 'col' }, lector, estadoTxt,
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn gris', onclick: () => cerrar(null) }, 'Cancelar')));
    const m = modal(cont, { titulo: opciones.titulo || 'Escanear etiqueta', fijo: true });
    const F = Html5QrcodeSupportedFormats;
    const sc = new Html5Qrcode('lector', { formatsToSupport: [F.QR_CODE, F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.ITF, F.DATA_MATRIX, F.CODABAR], useBarCodeDetectorIfSupported: true, verbose: false });
    let listo = false;
    const cerrar = async v => { try { if (listo) await sc.stop(); sc.clear(); } catch (e) { /* ignorar */ } m.cerrar(); resolve(v); };
    let leido = false;
    sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, hh) => ({ width: Math.round(w * .85), height: Math.round(Math.min(hh, w) * .45) }), videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
      async texto => { if (leido) return; leido = true; if (navigator.vibrate) navigator.vibrate(80); ultimaFotoEscaneo = await capturarFrame(lector); cerrar(texto); },
      () => { }
    ).then(() => { listo = true; }).catch(e => { toast('No se pudo iniciar la cámara: ' + (e.message || e), 'error'); cerrar(null); });
  });
}
/** Extrae un número de inventario o BNI de lo leído en el código. */
function extraerCodigo(texto) {
  if (!texto) return '';
  const t = String(texto).replace(/^\uFEFF/, '').trim().toUpperCase();
  const m = t.match(/B[NI][I1N]\s*\d{3,6}(-\d+)?/) || t.match(/\b[A-Z]{1,3}\d{4,7}\b/) || t.match(/\b\d{5,8}\b/);
  let c = (m ? m[0] : t).replace(/[^A-Z0-9-]/g, '');
  c = c.replace(/^BIN(?=\d)/, 'BNI').replace(/^BN1(\d{4})$/, 'BNI$1');
  return c;
}

// ============================================================ captura
let fotosPendientes = [];
async function vistaCaptura() {
  const lote = loteActual();
  if (!lote) return h('div', { class: 'tarjeta' }, h('p', null, 'Primero crea un lote en ', h('a', { href: '#/inicio' }, 'Inicio'), '.'));
  if (!estado.catalogo || !estado.catalogo.bienes) { const c = await api('GET', '/api/catalogo/estado'); estado.catalogo = c; }
  fotosPendientes = [];
  const cont = h('div');
  if (lote.estado === 'cerrado') cont.appendChild(h('div', { class: 'alerta amarillo' }, 'Este lote está cerrado; no se pueden capturar más bienes.'));
  if (!window.isSecureContext && /Android|iPhone|iPad/i.test(navigator.userAgent)) cont.appendChild(h('div', { class: 'alerta azul' }, 'Para usar la cámara en el celular abre la dirección ', h('b', null, 'https://'), ' que muestra el servidor (acepta el aviso del certificado una sola vez).'));
  let pestana = localStorage.getItem('sebi_pestana') || 'INV';
  const tabs = h('div', { class: 'pestanas' }, [['INV', 'Inventario o BNI'], ['BNI', 'BNI manual'], ['NR', 'Piezas sin inventario'], ['VER', '✓ Verificación']].map(([k, t]) => h('button', { class: pestana === k ? 'activa' : '', onclick: () => { pestana = k; localStorage.setItem('sebi_pestana', k); pintar(); } }, t)));
  const cuerpo = h('div');
  const recientes = h('div', { class: 'tarjeta recientes' });
  cont.appendChild(h('div', { class: 'tarjeta' }, tabs, cuerpo));
  cont.appendChild(recientes);
  function pintarRecientes() {
    recientes.innerHTML = '';
    recientes.appendChild(h('h3', null, `Capturados en esta sesión (${estado.recientes.length})`, ' ', h('a', { href: '#/lote', class: 'peq' }, 'ver todos')));
    if (!estado.recientes.length) recientes.appendChild(h('p', { class: 'suave peq' }, 'Aún no has capturado bienes en esta sesión.'));
    for (const it of estado.recientes.slice(0, 15)) recientes.appendChild(h('div', { class: 'item' },
      h('b', null, it.inv || it.bni || (it.cantidad + ' ×')), h('span', { class: 'crece' }, it.nombre, ' ', h('span', { class: 'suave' }, [it.marca, it.modelo].filter(Boolean).join(' '))),
      (it.alertas || []).map(a => a.codigo === 'OTRO_RESGUARDO' ? h('span', { class: 'chip naranja', title: a.texto }, '⚠ ' + a.resguardante) : h('span', { class: 'chip ' + a.nivel, title: a.texto }, a.codigo.replace(/_/g, ' '))),
      h('span', { class: 'mini suave' }, (it.fotos || []).length ? `📷${it.fotos.length}` : ''),
      h('button', { class: 'btn-icono', title: 'Editar', onclick: () => editarItem(it, () => { pintarRecientes(); }) }, '✏️'),
    ));
  }
  function pintar() { $$('button', tabs).forEach((b, i) => b.classList.toggle('activa', ['INV', 'BNI', 'NR', 'VER'][i] === pestana)); cuerpo.innerHTML = ''; cuerpo.appendChild(pestana === 'INV' ? formInventariable() : pestana === 'BNI' ? formBNI() : pestana === 'NR' ? formPiezas() : formVerificacion()); recientes.classList.toggle('oculto', pestana === 'VER' || pestana === 'NR'); pintarRecientes(); }
  pintar();
  return cont;

  // ---------- INVENTARIABLE
  function formInventariable() {
    const input = h('input', { type: 'text', class: 'input-grande', placeholder: 'A36417 o BNI0544', autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'search', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); consultar(null); } } });
    const detalle = h('div');
    const continuo = h('input', { type: 'checkbox', checked: localStorage.getItem('sebi_continuo') === '1', onchange: e => localStorage.setItem('sebi_continuo', e.target.checked ? '1' : '0') });
    const fotoAuto = h('input', { type: 'checkbox', checked: localStorage.getItem('sebi_fotoauto') !== '0', onchange: e => localStorage.setItem('sebi_fotoauto', e.target.checked ? '1' : '0') });
    const esMovil = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const f = h('div', { class: 'col' },
      h('div', { class: 'fila' }, h('div', { class: 'crece' }, input), h('button', { class: 'btn grande', onclick: escanearYConsultar }, '📷 Escanear'), h('button', { class: 'btn sec grande', onclick: () => consultar(null) }, 'Buscar')),
      h('div', { class: 'fila' }, h('label', { class: 'peq suave inline' }, continuo, ' Escaneo continuo'), h('label', { class: 'peq suave inline' }, fotoAuto, ' Foto automática del número de inventario')),
      detalle);
    setTimeout(() => { if (!esMovil) input.focus(); }, 50);
    async function escanearYConsultar() {
      const t = await escanear();
      if (!t) return;
      input.value = extraerCodigo(t);
      const foto = ultimaFotoEscaneo; ultimaFotoEscaneo = null;
      consultar(foto);
    }
    async function consultar(fotoEscaneo) {
      const inv = extraerCodigo(input.value);
      if (!inv) return;
      input.value = inv;
      detalle.innerHTML = ''; detalle.appendChild(h('p', { class: 'suave' }, 'Consultando…'));
      let r;
      try { r = await api('GET', `/api/lotes/${lote.id}/consulta?inv=${encodeURIComponent(inv)}`); }
      catch (e) { detalle.innerHTML = ''; detalle.appendChild(h('div', { class: 'alerta grande rojo' }, e.message)); return; }
      detalle.innerHTML = '';
      const duras = r.alertas.filter(a => a.bloquea);
      if (duras.length) {
        sonido('error'); if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 250]);
        detalle.appendChild(vistaBloqueo(r, inv, duras));
        detalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const atencion = r.alertas.some(a => a.nivel === 'rojo' || a.codigo === 'OTRO_RESGUARDO');
      sonido(atencion ? 'error' : 'ok'); if (atencion && navigator.vibrate) navigator.vibrate([150, 80, 150]);
      let foto = fotoEscaneo;
      if (!foto && fotoAuto.checked) foto = await tomarFoto(`Foto del número de inventario ${inv}`);
      detalle.appendChild(formularioBien(r, inv, foto));
    }
    function vistaBloqueo(r, inv, duras) {
      const b = r.bien;
      const resg = r.alertas.find(a => a.codigo === 'OTRO_RESGUARDO');
      return h('div', { class: 'col' },
        h('div', { class: 'bloqueo' },
          h('div', { class: 'bloqueo-icono' }, '⛔'),
          h('div', { class: 'bloqueo-titulo' }, 'NO SE PUEDE REGISTRAR'),
          h('div', { class: 'bloqueo-inv' }, inv),
          duras.map(a => h('div', { class: 'bloqueo-motivo' }, a.texto)),
          b ? h('div', { class: 'bloqueo-bien' }, `${b.nombre || ''} ${b.marca || ''} ${b.modelo || ''} · serie ${b.serie || '—'}`, h('br'), `Condición: ${b.cond || '—'} · Resguardo: ${b.resg || '—'}`) : null,
          h('div', { class: 'fila', style: { justifyContent: 'center', marginTop: '1rem' } },
            h('button', { class: 'btn grande blanco', onclick: () => { detalle.innerHTML = ''; input.value = ''; escanearYConsultar(); } }, '📷 Escanear siguiente'),
            r.existente ? h('button', { class: 'btn grande sec', onclick: () => editarItem(r.existente, () => { }) }, 'Ver registro existente') : null)),
        resg ? avisoResguardo(resg) : null);
    }
    function formularioBien(r, inv, fotoInicial) {
      const b = r.bien;
      fotosPendientes = fotoInicial ? [{ blob: fotoInicial, url: URL.createObjectURL(fotoInicial) }] : [];
      const esBNI = !!r.esBNI;
      const datos = esBNI
        ? { tipoItem: 'BNI', bni: r.codigo || inv, nombre: b ? b.nombre : '', descripcion: b ? b.nombre : '', marca: '', modelo: '', serie: '', estado: 'Desuso', clas: r.clas || '', ubicacion: localStorage.getItem('sebi_ubicacion') || '', observaciones: '' }
        : { tipoItem: 'INV', inv, nombre: b ? b.nombre : '', marca: b ? b.marca : '', modelo: b ? b.modelo : '', serie: b ? b.serie : '', registro: b ? (b.treg || 'No circulante') : 'No circulante', estado: 'Desuso', clas: r.clas || 'OTRO', ubicacion: localStorage.getItem('sebi_ubicacion') || '', observaciones: '' };
      const forzables = r.alertas.filter(a => a.nivel === 'rojo' && !a.bloquea);
      const resg = r.alertas.find(a => a.codigo === 'OTRO_RESGUARDO');
      const el = h('div', { class: 'col' });
      if (resg) el.appendChild(avisoResguardo(resg));
      if (b) el.appendChild(h('div', { class: 'detalle-bien' }, h('dl', null,
        h('dt', null, 'Bien'), h('dd', null, h('b', null, b.nombre), ' ', [b.marca, b.modelo].filter(Boolean).join(' '), b.color ? ` · ${b.color}` : ''),
        h('dt', null, 'Serie'), h('dd', { class: 'mono' }, b.serie || '—'),
        h('dt', null, 'Condición'), h('dd', null, b.cond || '—', ' · ', b.treg || ''),
        h('dt', null, 'Resguardo'), h('dd', null, b.resg || '—', b.ads ? h('span', { class: 'suave' }, ` (${b.ads})`) : ''),
        h('dt', null, 'Registro'), h('dd', null, b.origen === 'BNI' ? `${b.freg || '—'} · bajo costo` : `${b.freg || '—'} · valor ${fmtDinero(b.valor)} · ${b.partidaDesc || ''}`),
        b.obs ? h('dt', null, 'Obs. sistema') : null, b.obs ? h('dd', null, b.obs) : null,
      )));
      else el.appendChild(h('div', { class: 'alerta grande amarillo' }, h('b', null, inv), r.esBNI ? ' no está en el catálogo de bajo costo. Escribe el nombre del bien para capturarlo.' : ' no está en el catálogo. Puedes capturarlo manualmente (quedará marcado como "no encontrado en sistema").'));
      const otras = r.alertas.filter(a => a.codigo !== 'OTRO_RESGUARDO');
      el.appendChild(h('div', null, otras.map(a => h('div', { class: 'alerta grande ' + a.nivel }, a.texto)), !r.alertas.length && b ? h('div', { class: 'alerta grande verde' }, '✔ Sin alertas: candidato limpio para enajenación.') : null));
      if (esBNI) el.insertBefore(h('div', { class: 'fila' }, h('span', { class: 'chip amarillo' }, 'Bien de bajo costo (BNI)')), el.firstChild);
      el.appendChild(camposBien(datos, esBNI ? { bni: true } : { sinSerie: b && /SIN|S\/N|^$/i.test(b.serie || '') }));
      const forzar = forzables.length ? h('label', { class: 'fila peq' }, h('input', { type: 'checkbox', name: 'forzar' }), h('b', null, 'Agregar de todos modos'), ' (quedará marcado como forzado y aparecerá en Análisis)') : null;
      if (forzar) el.appendChild(h('div', { class: 'alerta grande rojo' }, 'Revisa la alerta antes de guardar. ', forzar));
      el.appendChild(h('div', { class: 'acciones', style: { justifyContent: 'flex-start' } },
        h('button', { class: 'btn grande', disabled: lote.estado === 'cerrado', onclick: async ev => {
          const btn = ev.currentTarget; btn.disabled = true;
          try {
            const it = await guardarItem({ ...datos, forzar: forzar ? $('[name=forzar]', forzar).checked : false });
            toast(`Guardado ${it.inv || it.bni}`, 'ok');
            input.value = ''; detalle.innerHTML = '';
            if (continuo.checked) escanearYConsultar(); else if (!esMovil) input.focus();
          } catch (e) { toast(e.message, 'error'); sonido('error'); btn.disabled = false; }
        } }, '💾 Guardar bien'),
        h('button', { class: 'btn gris', onclick: () => { detalle.innerHTML = ''; input.value = ''; input.focus(); } }, 'Cancelar')));
      return el;
    }
    return f;
  }
  // ---------- BNI
  function formBNI() {
    fotosPendientes = [];
    const datos = { tipoItem: 'BNI', bni: '', nombre: '', descripcion: '', marca: '', modelo: '', serie: '', estado: 'Desuso', clas: '', ubicacion: localStorage.getItem('sebi_ubicacion') || '', observaciones: '' };
    const inputBni = h('input', { type: 'text', class: 'input-grande', placeholder: 'BNI0544', autocapitalize: 'characters', oninput: e => datos.bni = e.target.value });
    const campos = camposBien(datos, { bni: true });
    const el = h('div', { class: 'col' },
      h('p', { class: 'peq suave' }, 'Para BNI que no estén en el catálogo de bajo costo. Los que sí están se escanean en la pestaña "Inventario o BNI", con sus alertas y bloqueos.'),
      h('div', { class: 'fila' }, h('div', { class: 'crece' }, inputBni), h('button', { class: 'btn grande', onclick: async () => { const t = await escanear({ titulo: 'Escanear etiqueta BNI' }); if (t) { inputBni.value = extraerCodigo(t); datos.bni = inputBni.value; if (ultimaFotoEscaneo) { fotosPendientes.push({ blob: ultimaFotoEscaneo, url: URL.createObjectURL(ultimaFotoEscaneo) }); ultimaFotoEscaneo = null; campos.pintarFotos(); } } } }, '📷 Escanear')),
      campos,
      h('div', { class: 'acciones', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn grande', disabled: lote.estado === 'cerrado', onclick: async ev => {
        const btn = ev.currentTarget; btn.disabled = true;
        try { if (!datos.clas) datos.clas = ''; const it = await guardarItem(datos); toast(`Guardado ${it.bni}`, 'ok'); pintar(); } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
      } }, '💾 Guardar bien')));
    return el;
  }
  // ---------- NO REGISTRADO
  function formNR() {
    fotosPendientes = [];
    const datos = { tipoItem: 'NR', nombre: '', cantidad: 1, marca: '', modelo: '', estado: 'Desuso', clas: '', ubicacion: localStorage.getItem('sebi_ubicacion') || '', observaciones: '' };
    const el = h('div', { class: 'col' },
      h('p', { class: 'peq suave' }, 'Bienes sin número de inventario ni etiqueta BNI (teclados, mouse, cables…). Se reportan por cantidad y tipo.'),
      camposBien(datos, { nr: true }),
      h('div', { class: 'acciones', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn grande', disabled: lote.estado === 'cerrado', onclick: async ev => {
        const btn = ev.currentTarget; btn.disabled = true;
        try { const it = await guardarItem(datos); toast(`Guardado ${it.cantidad} × ${it.nombre}`, 'ok'); pintar(); } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
      } }, '💾 Guardar')));
    return el;
  }
  // ---------- PIEZAS SIN INVENTARIO
  function formPiezas() {
    const PRESET = [['CABLE', 'CABLE', '🔌'], ['CARGADOR', 'CARGADOR', '🔋'], ['TECLADO', 'TECLADO', '⌨️'], ['MOUSE', 'MOUSE', '🖱️'], ['CAMARA', 'CÁMARA DE SEGURIDAD', '📹'], ['REFACCION', 'PIEZA / REFACCIÓN', '🔩'],
      ['REFACCION', 'MEMORIA RAM', '🧩'], ['DISCO_DURO', 'DISCO DURO', '💾'], ['CONVERSOR', 'ADAPTADOR', '🔁'], ['BOCINA', 'BOCINA', '🔊'], ['BOCINA', 'DIADEMA / AUDÍFONOS', '🎧'], ['REFACCION', 'MULTICONTACTO', '⚡']];
    const nombreN = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const cerrado = lote.estado === 'cerrado';
    let datos = [];
    const rejilla = h('div', { class: 'piezas' });
    const totalEl = h('div', { class: 'kpi' });
    async function ajustar(nombre, clas, cuerpo) {
      try { const r = await api('POST', `/api/lotes/${lote.id}/piezas`, { nombre, clas, ...cuerpo }); datos = r.piezas; sonido('ok'); if (navigator.vibrate) navigator.vibrate(30); pintarRejilla(); }
      catch (e) { toast(e.message, 'error'); }
    }
    function tarjeta(nombre, clas, icono) {
      const d = datos.find(x => nombreN(x.nombre) === nombreN(nombre)) || { total: 0, mio: 0 };
      return h('div', { class: 'pieza' + (d.total ? ' con' : '') },
        h('div', { class: 'pz-ico' }, icono || '📦'),
        h('div', { class: 'pz-nom' }, nombre),
        h('button', { class: 'pz-num', title: 'Toca para escribir la cantidad', onclick: () => { if (cerrado) return; const v = prompt(`${nombre}\nCantidad que tú contaste (total de todos: ${d.total}):`, d.mio); if (v == null) return; const n = parseInt(v, 10); if (isNaN(n) || n < 0) return toast('Cantidad inválida', 'error'); ajustar(nombre, clas, { cantidad: n }); } }, d.total),
        h('div', { class: 'mini suave' }, d.total !== d.mio ? `tuyos: ${d.mio}` : ' '),
        h('div', { class: 'pz-btns' },
          h('button', { class: 'btn gris', disabled: cerrado, onclick: () => { if (!d.mio) return toast('Solo puedes restar lo que tú contaste'); ajustar(nombre, clas, { delta: -1 }); } }, '−1'),
          h('button', { class: 'btn', disabled: cerrado, onclick: () => ajustar(nombre, clas, { delta: 1 }) }, '+1'),
          h('button', { class: 'btn sec', disabled: cerrado, onclick: () => ajustar(nombre, clas, { delta: 5 }) }, '+5')));
    }
    function pintarRejilla() {
      rejilla.innerHTML = '';
      const usados = new Set();
      for (const [clas, nombre, ico] of PRESET) { usados.add(nombreN(nombre)); rejilla.appendChild(tarjeta(nombre, clas, ico)); }
      for (const d of datos) if (!usados.has(nombreN(d.nombre))) rejilla.appendChild(tarjeta(d.nombre, d.clas, '📦'));
      totalEl.innerHTML = '';
      totalEl.appendChild(h('div', null, h('b', null, datos.reduce((s, d) => s + d.total, 0)), h('small', null, 'piezas sin inventario en el lote')));
      totalEl.appendChild(h('div', null, h('b', null, datos.filter(d => d.total).length), h('small', null, 'tipos distintos')));
      totalEl.appendChild(h('div', null, h('b', null, datos.reduce((s, d) => s + d.mio, 0)), h('small', null, 'contadas por ti')));
    }
    const otroNombre = h('input', { type: 'text', placeholder: 'Ej. CABLE VGA, FUENTE DE PODER, TARJETA DE RED', autocapitalize: 'characters' });
    const otroCant = h('input', { type: 'number', min: 1, value: 1, style: { maxWidth: '100px' } });
    const el = h('div', { class: 'col' },
      h('p', { class: 'peq suave' }, 'Piezas pequeñas sin número de inventario ni etiqueta BNI. Solo se cuentan: toca +1 por cada pieza, o toca el número para escribir la cantidad. Salen en los documentos en la tabla de bienes no registrados.'),
      totalEl, rejilla,
      h('div', { class: 'detalle-bien' }, h('h3', null, 'Otra pieza'), h('div', { class: 'fila' }, h('div', { class: 'crece' }, otroNombre), otroCant,
        h('button', { class: 'btn', disabled: cerrado, onclick: () => { const n = nombreN(otroNombre.value); if (!n) return toast('Escribe el nombre de la pieza', 'error'); const c = parseInt(otroCant.value, 10) || 1; ajustar(n, adivinarClase(n), { delta: c }); otroNombre.value = ''; otroCant.value = 1; } }, '+ Agregar'))));
    api('GET', `/api/lotes/${lote.id}/piezas`).then(r => { datos = r.piezas; pintarRejilla(); }).catch(e => toast(e.message, 'error'));
    pintarRejilla();
    return el;
  }
  // ---------- VERIFICACIÓN FÍSICA
  function formVerificacion() {
    const input = h('input', { type: 'text', class: 'input-grande', placeholder: 'A36417 o BNI0544', autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'go', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); verificar(); } } });
    const resultado = h('div');
    const contador = h('div', { class: 'kpi' });
    const lista = h('div', { class: 'recientes' });
    const verificados = [];
    const el = h('div', { class: 'col' },
      h('p', { class: 'peq suave' }, 'Para el día de la inspección física: escanea cada bien; si está en el lote se marca como verificado (quién y cuándo). Los no encontrados se avisan en rojo.'),
      h('div', { class: 'fila' }, h('div', { class: 'crece' }, input), h('button', { class: 'btn grande', onclick: async () => { const t = await escanear({ titulo: 'Verificar bien' }); if (t) { input.value = extraerCodigo(t); verificar(); } } }, '📷 Escanear'), h('button', { class: 'btn sec grande', onclick: verificar }, 'Verificar')),
      contador, resultado, lista);
    async function refrescarContador(r) { if (r && r.total != null) { contador.innerHTML = ''; contador.appendChild(h('div', null, h('b', null, `${r.verificados} / ${r.total}`), h('small', null, 'verificados (inventariables + BNI)'))); } }
    async function verificar() {
      const codigo = extraerCodigo(input.value); if (!codigo) return;
      input.value = ''; resultado.innerHTML = '';
      try {
        const r = await api('POST', `/api/lotes/${lote.id}/verificar`, { codigo });
        if (!r.encontrado) { resultado.appendChild(h('div', { class: 'alerta rojo' }, h('b', null, codigo), ': ', r.mensaje)); if (navigator.vibrate) navigator.vibrate([100, 60, 100]); }
        else {
          const it = r.item;
          resultado.appendChild(h('div', { class: 'alerta verde' }, h('b', null, it.inv || it.bni), ` ✓ ${it.nombre} ${it.marca || ''} ${it.modelo || ''}`, r.yaEstaba ? h('span', { class: 'chip amarillo', style: { marginLeft: '.5rem' } }, `ya verificado por ${it.verificadoPor}`) : null,
            h('button', { class: 'btn chico gris', style: { marginLeft: '.6rem' }, onclick: async () => { await api('POST', `/api/lotes/${lote.id}/verificar`, { codigo, quitar: true }); resultado.innerHTML = ''; toast('Desmarcado'); } }, 'Desmarcar')));
          verificados.unshift(it); lista.innerHTML = ''; verificados.slice(0, 20).forEach(v => lista.appendChild(h('div', { class: 'item' }, h('b', null, v.inv || v.bni), h('span', { class: 'crece' }, v.nombre), h('span', { class: 'chip verde' }, '✓'))));
          refrescarContador(r);
        }
        if (localStorage.getItem('sebi_continuo') === '1') { const t = await escanear({ titulo: 'Verificar bien' }); if (t) { input.value = extraerCodigo(t); verificar(); } }
      } catch (e) { resultado.appendChild(h('div', { class: 'alerta rojo' }, e.message)); }
    }
    api('GET', `/api/lotes/${lote.id}`).then(d => { const t = d.items.filter(i => !i.excluido && i.tipoItem !== 'NR'); refrescarContador({ verificados: t.filter(i => i.verificado).length, total: t.length }); });
    setTimeout(() => { if (!/Android|iPhone|iPad/i.test(navigator.userAgent)) input.focus(); }, 50);
    return el;
  }
  async function guardarItem(datos) {
    if (datos.tipoItem !== 'INV' && !datos.clas) datos.clas = adivinarClase(datos.nombre);
    const it = await api('POST', `/api/lotes/${lote.id}/items`, datos);
    localStorage.setItem('sebi_ubicacion', datos.ubicacion || '');
    for (const f of fotosPendientes) { try { const r = await api('POST', `/api/items/${it.id}/fotos`, f.blob); it.fotos = r.fotos; } catch (e) { toast('Foto no subida: ' + e.message, 'error'); } }
    fotosPendientes = [];
    estado.recientes.unshift(it);
    const l = loteActual(); if (l) { l.resumen.total++; if (it.tipoItem === 'INV') l.resumen.inv++; else if (it.tipoItem === 'BNI') l.resumen.bni++; else l.resumen.nr += Number(it.cantidad || 1); }
    return it;
  }
}
function adivinarClase(nombre) {
  const n = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let mejor = 'OTRO', len = 0;
  for (const c of clases()) for (const p of (c.patrones || [])) { try { const m = n.match(new RegExp(p, 'i')); if (m && m[0].length > len) { mejor = c.clave; len = m[0].length; } } catch (e) { /* patrón inválido */ } }
  return mejor;
}
/** Campos comunes del bien (enlazados al objeto datos). */
function camposBien(datos, o = {}) {
  const inp = (k, etiqueta, extra = {}) => h('label', { class: 'campo' }, h('span', null, etiqueta), h('input', { type: extra.type || 'text', value: datos[k] == null ? '' : datos[k], placeholder: extra.placeholder || '', min: extra.min, list: extra.list, oninput: e => { datos[k] = extra.type === 'number' ? Number(e.target.value) : e.target.value; if (extra.onchange) extra.onchange(e.target.value); } }));
  const selClase = h('select', { onchange: e => datos.clas = e.target.value }, h('option', { value: '' }, '(automática según el nombre)'), clases().map(c => h('option', { value: c.clave, selected: datos.clas === c.clave }, `${c.nombre} — ${fmtDinero(c.valor)}`)));
  const fotos = h('div', { class: 'miniaturas' });
  const pintarFotos = () => { fotos.innerHTML = ''; fotosPendientes.forEach((f, i) => fotos.appendChild(h('div', { class: 'foto' }, h('img', { src: f.url }), h('button', { onclick: () => { fotosPendientes.splice(i, 1); pintarFotos(); } }, '×')))); };
  pintarFotos();
  const listaNombres = h('datalist', { id: 'nombres-bien' }, clases().map(c => h('option', { value: c.tipo || c.nombre.toUpperCase() })));
  const raiz = h('div', { class: 'col mt' },
    listaNombres,
    h('div', { class: o.nr ? 'grid2' : 'grid3' },
      inp('nombre', o.nr ? 'Nombre del bien (tipo)' : 'Tipo / nombre del bien', { list: 'nombres-bien', onchange: v => { if (!datos.clas || o.bni || o.nr) { const k = adivinarClase(v); datos.clas = k; selClase.value = k; } } }),
      o.nr ? inp('cantidad', 'Cantidad', { type: 'number', min: 1 }) : inp('marca', 'Marca'),
      o.nr ? null : inp('modelo', 'Modelo'),
    ),
    h('div', { class: 'grid3' },
      o.nr ? inp('marca', 'Marca (opcional)') : inp('serie', 'Número de serie' + (o.sinSerie ? ' (captura la serie física si la tiene)' : ''), { placeholder: 'SIN NUMERO SERIE' }),
      o.bni ? inp('descripcion', 'Descripción') : null,
      h('label', { class: 'campo' }, h('span', null, 'Estado'), h('select', { onchange: e => datos.estado = e.target.value }, ['Desuso', 'Inservible', 'Funcionando'].map(v => h('option', { value: v, selected: datos.estado === v }, v)))),
      datos.tipoItem === 'INV' ? h('label', { class: 'campo' }, h('span', null, 'Registro'), h('select', { onchange: e => datos.registro = e.target.value }, ['No circulante', 'Gasto'].map(v => h('option', { value: v, selected: datos.registro === v }, v)))) : null,
    ),
    h('div', { class: 'grid2' },
      h('label', { class: 'campo' }, h('span', null, 'Clasificación general (para el avalúo)'), selClase),
      inp('ubicacion', 'Ubicación en bodega (estante, tarima…)', { placeholder: 'Ej. Estante 3, nivel 2' }),
    ),
    h('label', { class: 'campo' }, h('span', null, 'Observaciones'), h('textarea', { oninput: e => datos.observaciones = e.target.value }, datos.observaciones || '')),
    h('div', { class: 'col' }, h('div', { class: 'fila' }, h('button', { class: 'btn sec', onclick: async () => { const b = await tomarFoto(); if (b) { fotosPendientes.push({ blob: b, url: URL.createObjectURL(b) }); pintarFotos(); } } }, '📸 Tomar foto'), h('span', { class: 'peq suave' }, 'Se recomienda una foto del bien y otra de la etiqueta de serie.')), fotos),
  );
  raiz.pintarFotos = pintarFotos;
  return raiz;
}

// ============================================================ edición de un bien (modal)
function editarItem(it, alGuardar) {
  const datos = { ...it };
  fotosPendientes = [];
  const fotosEl = h('div', { class: 'miniaturas' });
  const pintarFotos = () => { fotosEl.innerHTML = ''; (datos.fotos || []).forEach(f => fotosEl.appendChild(h('div', { class: 'foto' }, h('img', { src: 'fotos/' + f, onclick: () => window.open('fotos/' + f, '_blank') }), h('button', { onclick: async () => { if (!await confirmar('¿Eliminar esta foto?')) return; const r = await api('DELETE', `/api/items/${it.id}/fotos/${f}`); datos.fotos = r.fotos; it.fotos = r.fotos; pintarFotos(); } }, '×')))); };
  pintarFotos();
  const encabezado = it.tipoItem === 'INV' ? h('div', { class: 'detalle-bien' }, h('b', { class: 'mono', style: { fontSize: '1.2rem' } }, it.inv), it.catalogo ? h('dl', null,
    h('dt', null, 'Sistema'), h('dd', null, `${it.catalogo.nombre || ''} ${it.catalogo.marca || ''} ${it.catalogo.modelo || ''} · serie ${it.catalogo.serie || '—'}`),
    h('dt', null, 'Condición'), h('dd', null, `${it.catalogo.cond || '—'} · ${it.catalogo.treg || ''} · resguardo: ${it.catalogo.resg || '—'}`)) : h('p', { class: 'peq suave' }, 'No encontrado en el catálogo del sistema')) :
    h('div', { class: 'detalle-bien' }, h('b', { class: 'mono' }, it.tipoItem === 'BNI' ? it.bni : `No registrado`));
  const alertas = h('div', null, (it.alertas || []).map(a => h('div', { class: 'alerta ' + a.nivel }, a.texto)));
  const cont = h('div', { class: 'col' }, encabezado, alertas,
    it.tipoItem === 'BNI' ? h('label', { class: 'campo' }, h('span', null, 'Número BNI'), h('input', { type: 'text', value: datos.bni || '', oninput: e => datos.bni = e.target.value })) : null,
    camposBien(datos, { bni: it.tipoItem === 'BNI', nr: it.tipoItem === 'NR' }),
    h('div', null, h('b', { class: 'peq' }, 'Fotos guardadas'), fotosEl),
    h('p', { class: 'mini suave' }, `Capturado por ${it.capturadoNombre || it.capturadoPor} el ${fmtFecha(it.fechaCaptura)}${it.modificadoPor ? ` · modificado por ${it.modificadoPor} el ${fmtFecha(it.fechaModificacion)}` : ''}${it.forzado ? ' · FORZADO (' + it.forzado.join(', ') + ')' : ''}`),
    h('div', { class: 'acciones', style: { justifyContent: 'space-between' } },
      h('div', { class: 'fila' },
        h('button', { class: 'btn gris', onclick: async () => { datos.excluido = !datos.excluido; await guardar(); } }, datos.excluido ? '↩ Reincorporar al lote' : '⛔ Excluir del lote'),
        h('button', { class: 'btn peligro', onclick: async () => { if (!await confirmar('¿Eliminar definitivamente este bien del lote?')) return; try { await api('DELETE', `/api/items/${it.id}`); m.cerrar(); toast('Eliminado', 'ok'); alGuardar(null); } catch (e) { toast(e.message, 'error'); } } }, 'Eliminar')),
      h('div', { class: 'fila' }, h('button', { class: 'btn gris', onclick: () => m.cerrar() }, 'Cerrar'), h('button', { class: 'btn', onclick: guardar }, '💾 Guardar cambios'))));
  const m = modal(cont, { titulo: 'Editar bien', ancho: true });
  async function guardar() {
    try {
      const r = await api('PUT', `/api/items/${it.id}`, datos);
      for (const f of fotosPendientes) { const rf = await api('POST', `/api/items/${it.id}/fotos`, f.blob); r.fotos = rf.fotos; }
      fotosPendientes = [];
      Object.assign(it, r);
      m.cerrar(); toast('Guardado', 'ok'); alGuardar(r);
    } catch (e) { toast(e.message, 'error'); }
  }
}

// ============================================================ bienes del lote
async function vistaLote() {
  const lote = loteActual();
  if (!lote) return h('div', { class: 'tarjeta' }, h('p', null, 'No hay lote seleccionado.'));
  const r = await api('GET', `/api/lotes/${lote.id}`);
  let items = r.items;
  const filtro = { q: '', tipo: '', clas: '', alerta: '', usuario: '', orden: 'fechaCaptura', dir: -1, excluidos: false };
  const cont = h('div');
  const resumen = h('div', { class: 'kpi' });
  const tabla = h('div', { class: 'tabla-wrap' });
  const seleccion = new Set();
  const usuarios = [...new Set(items.map(i => i.capturadoPor))];
  const filtros = h('div', { class: 'fila filtros' },
    h('input', { type: 'search', placeholder: 'Buscar inventario, serie, marca…', style: { maxWidth: '280px' }, oninput: e => { filtro.q = e.target.value.toUpperCase(); pintar(); } }),
    h('select', { onchange: e => { filtro.tipo = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todos los tipos'), h('option', { value: 'INV' }, 'Inventariables'), h('option', { value: 'BNI' }, 'BNI'), h('option', { value: 'NR' }, 'No registrados')),
    h('select', { onchange: e => { filtro.clas = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todas las clasificaciones'), clases().map(c => h('option', { value: c.clave }, c.nombre))),
    h('select', { onchange: e => { filtro.alerta = e.target.value; pintar(); } }, h('option', { value: '' }, 'Con o sin alertas'), h('option', { value: 'rojo' }, 'Alertas rojas'), h('option', { value: 'amarillo' }, 'Alertas amarillas'), h('option', { value: 'cualquiera' }, 'Cualquier alerta'), h('option', { value: 'ninguna' }, 'Sin alertas'), h('option', { value: 'sinfoto' }, 'Sin foto'), h('option', { value: 'resguardo' }, 'De otro resguardante'), h('option', { value: 'verificado' }, 'Verificados'), h('option', { value: 'noverificado' }, 'No verificados')),
    h('select', { onchange: e => { filtro.usuario = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todos los usuarios'), usuarios.map(u => h('option', { value: u }, u))),
    h('label', { class: 'peq inline' }, h('input', { type: 'checkbox', onchange: e => { filtro.excluidos = e.target.checked; pintar(); } }), 'Mostrar excluidos'),
  );
  const acciones = h('div', { class: 'fila' },
    h('button', { class: 'btn sec chico', onclick: () => descargar(`/api/lotes/${lote.id}/excel`) }, '⬇ Excel'),
    h('button', { class: 'btn sec chico', onclick: () => imprimirEtiquetas(lote, items.filter(i => !i.excluido)) }, '🏷 Etiquetas'),
    h('button', { class: 'btn sec chico', onclick: () => imprimirConteo(lote) }, '🖨 Hoja de conteo'),
    h('button', { class: 'btn gris chico', onclick: () => accionMasiva('excluir') }, 'Excluir seleccionados'),
    h('button', { class: 'btn gris chico', onclick: () => accionMasiva('clase') }, 'Cambiar clasificación'),
    h('button', { class: 'btn gris chico', onclick: () => imprimirEtiquetas(lote, items.filter(i => seleccion.has(i.id))) }, 'Etiquetas de seleccionados'),
  );
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, `Bienes de ${lote.nombre}`, h('button', { class: 'btn chico', onclick: () => irA('#/captura') }, '📷 Capturar')), resumen, h('div', { class: 'mt' }, filtros), h('div', { class: 'mt' }, acciones)));
  cont.appendChild(h('div', { class: 'tarjeta' }, tabla));
  const columnas = [['', ''], ['num', '#'], ['tipoItem', 'Tipo'], ['inv', 'Inventario / BNI'], ['nombre', 'Bien'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serie', 'Serie'], ['clas', 'Clasificación'], ['estado', 'Estado'], ['registro', 'Registro'], ['alertas', 'Alertas'], ['fotos', '📷'], ['verificado', '✓'], ['ubicacion', 'Ubicación'], ['capturadoPor', 'Capturó'], ['fechaCaptura', 'Fecha'], ['', '']];
  function filtrar() {
    return items.filter(i => {
      if (!filtro.excluidos && i.excluido) return false;
      if (filtro.tipo && i.tipoItem !== filtro.tipo) return false;
      if (filtro.clas && i.clas !== filtro.clas) return false;
      if (filtro.usuario && i.capturadoPor !== filtro.usuario) return false;
      if (filtro.alerta === 'rojo' && !i.alertas.some(a => a.nivel === 'rojo')) return false;
      if (filtro.alerta === 'amarillo' && !i.alertas.some(a => a.nivel === 'amarillo')) return false;
      if (filtro.alerta === 'cualquiera' && !i.alertas.length) return false;
      if (filtro.alerta === 'ninguna' && i.alertas.length) return false;
      if (filtro.alerta === 'sinfoto' && (i.fotos || []).length) return false;
      if (filtro.alerta === 'resguardo' && !i.alertas.some(a => a.codigo === 'OTRO_RESGUARDO')) return false;
      if (filtro.alerta === 'verificado' && !i.verificado) return false;
      if (filtro.alerta === 'noverificado' && (i.verificado || i.tipoItem === 'NR')) return false;
      if (filtro.q && !`${i.inv || ''} ${i.bni || ''} ${i.nombre || ''} ${i.marca || ''} ${i.modelo || ''} ${i.serie || ''} ${i.observaciones || ''} ${i.ubicacion || ''}`.toUpperCase().includes(filtro.q)) return false;
      return true;
    }).sort((a, b) => { const k = filtro.orden; let va = a[k], vb = b[k]; if (k === 'alertas') { va = a.alertas.length; vb = b.alertas.length; } if (k === 'fotos') { va = (a.fotos || []).length; vb = (b.fotos || []).length; } if (k === 'inv') { va = a.inv || a.bni || ''; vb = b.inv || b.bni || ''; } return (va > vb ? 1 : va < vb ? -1 : 0) * filtro.dir; });
  }
  function pintar() {
    const act = items.filter(i => !i.excluido);
    resumen.innerHTML = '';
    [[act.filter(i => i.tipoItem === 'INV').length, 'inventariables'], [act.filter(i => i.tipoItem === 'BNI').length, 'BNI'], [act.filter(i => i.tipoItem === 'NR').reduce((s, i) => s + Number(i.cantidad || 1), 0), 'no registrados'], [act.filter(i => i.alertas.some(a => a.nivel === 'rojo')).length, 'con alerta roja'], [act.filter(i => i.alertas.some(a => a.codigo === 'OTRO_RESGUARDO')).length, 'de otro resguardante'], [act.filter(i => !(i.fotos || []).length).length, 'sin foto'], [act.filter(i => i.verificado).length, 'verificados'], [items.filter(i => i.excluido).length, 'excluidos']].forEach(([n, t]) => resumen.appendChild(h('div', null, h('b', null, n), h('small', null, t))));
    const lista = filtrar();
    tabla.innerHTML = '';
    const t = h('table', { class: 'tabla' },
      h('thead', null, h('tr', null, columnas.map(([k, et]) => h('th', { onclick: () => { if (!k) return; if (filtro.orden === k) filtro.dir *= -1; else { filtro.orden = k; filtro.dir = 1; } pintar(); } }, et, filtro.orden === k ? (filtro.dir > 0 ? ' ▲' : ' ▼') : '')))),
      h('tbody', null, lista.map((i, idx) => h('tr', { class: [i.excluido ? 'excluido' : '', i.alertas.some(a => a.codigo === 'OTRO_RESGUARDO') ? 'resguardo' : ''].join(' ') },
        h('td', null, h('input', { type: 'checkbox', checked: seleccion.has(i.id), onchange: e => e.target.checked ? seleccion.add(i.id) : seleccion.delete(i.id) })),
        h('td', { class: 'num' }, idx + 1),
        h('td', null, h('span', { class: 'chip ' + (i.tipoItem === 'INV' ? 'azul' : i.tipoItem === 'BNI' ? 'amarillo' : 'gris') }, i.tipoItem === 'NR' ? `NR ×${i.cantidad}` : i.tipoItem)),
        h('td', { class: 'mono' }, i.inv || i.bni || '—'),
        h('td', null, i.nombre), h('td', null, i.marca), h('td', null, i.modelo), h('td', { class: 'mono' }, i.serie),
        h('td', null, nombreClase(i.clas)), h('td', null, i.estado), h('td', null, i.registro || ''),
        h('td', null, i.alertas.map(a => a.codigo === 'OTRO_RESGUARDO' ? h('span', { class: 'chip naranja', title: a.texto, style: { marginRight: '2px' } }, '⚠ RESGUARDO: ' + a.resguardante) : h('span', { class: 'chip ' + a.nivel, title: a.texto, style: { marginRight: '2px' } }, a.codigo.replace(/_/g, ' '))), i.forzado ? h('span', { class: 'chip rojo', title: 'Capturado forzando alertas' }, 'FORZADO') : null),
        h('td', null, (i.fotos || []).length || ''), h('td', { title: i.verificado ? `Verificado por ${i.verificadoPor} el ${fmtFecha(i.fechaVerificacion)}` : '' }, i.verificado ? h('span', { class: 'chip verde' }, '✓') : ''), h('td', null, i.ubicacion || ''), h('td', null, i.capturadoPor), h('td', { class: 'mini' }, fmtFecha(i.fechaCaptura)),
        h('td', null, h('button', { class: 'btn-icono', onclick: () => editarItem(i, async r2 => { const r3 = await api('GET', `/api/lotes/${lote.id}`); items = r3.items; pintar(); }) }, '✏️')),
      ))));
    tabla.appendChild(h('p', { class: 'peq suave' }, `${lista.length} bienes mostrados`));
    tabla.appendChild(t);
  }
  async function accionMasiva(tipo) {
    const ids = [...seleccion];
    if (!ids.length) return toast('Selecciona bienes con las casillas de la tabla');
    if (tipo === 'excluir') { if (!await confirmar(`¿Excluir ${ids.length} bienes del lote? (se pueden reincorporar después)`)) return; for (const id of ids) await api('PUT', `/api/items/${id}`, { excluido: true }); }
    if (tipo === 'clase') {
      const sel = h('select', null, clases().map(c => h('option', { value: c.clave }, c.nombre)));
      const m = modal(h('div', { class: 'col' }, h('p', null, `Nueva clasificación para ${ids.length} bienes:`), sel, h('div', { class: 'acciones' }, h('button', { class: 'btn gris', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn', onclick: async () => { for (const id of ids) await api('PUT', `/api/items/${id}`, { clas: sel.value }); m.cerrar(); const r3 = await api('GET', `/api/lotes/${lote.id}`); items = r3.items; seleccion.clear(); pintar(); } }, 'Aplicar'))), { titulo: 'Cambiar clasificación' });
      return;
    }
    const r3 = await api('GET', `/api/lotes/${lote.id}`); items = r3.items; seleccion.clear(); pintar();
  }
  pintar();
  return cont;
}

// ============================================================ análisis
async function vistaAnalisis() {
  const lote = loteActual();
  if (!lote) return h('div', { class: 'tarjeta' }, h('p', null, 'No hay lote seleccionado.'));
  const a = await api('GET', `/api/lotes/${lote.id}/analisis`);
  const cont = h('div');
  const recargar = () => irA('#/analisis');
  const filaItem = i => h('div', { class: 'bien-card' }, h('div', { class: 'enc' }, h('b', null, i.inv || i.bni || `${i.cantidad} × ${i.nombre}`), h('span', { class: 'mini suave' }, `${i.capturadoPor} · ${fmtFecha(i.fechaCaptura)}`)),
    h('div', { class: 'peq' }, `${i.nombre || ''} ${i.marca || ''} ${i.modelo || ''} · serie ${i.serie || '—'} · ${nombreClase(i.clas)}`),
    h('div', null, (i.alertas || []).map(x => h('div', { class: 'alerta ' + x.nivel }, x.texto))),
    h('div', { class: 'fila' }, h('button', { class: 'btn chico sec', onclick: () => editarItem(i, recargar) }, 'Editar'), h('button', { class: 'btn chico gris', onclick: async () => { await api('PUT', `/api/items/${i.id}`, { excluido: true }); toast('Excluido'); recargar(); } }, 'Excluir')));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, `Análisis de ${lote.nombre}`),
    h('div', { class: 'kpi' },
      h('div', null, h('b', null, a.resumen.total), h('small', null, 'bienes activos')),
      h('div', null, h('b', null, a.duplicados.porInv.length + a.duplicados.porBni.length), h('small', null, 'inventarios/BNI repetidos')),
      h('div', null, h('b', null, a.duplicados.porSerie.length), h('small', null, 'series repetidas')),
      h('div', null, h('b', null, a.duplicados.sospechosos.length), h('small', null, 'grupos sospechosos')),
      h('div', null, h('b', null, a.conAlertas.length), h('small', null, 'con alertas')),
      h('div', null, h('b', null, a.sinFoto), h('small', null, 'sin foto')),
      h('div', null, h('b', null, a.sinClas), h('small', null, 'sin clasificar (Otro)')),
    )));
  const grupo = (titulo, g, nota) => h('div', { class: 'tarjeta' }, h('h3', null, `${titulo} (${g.length})`), nota ? h('p', { class: 'peq suave' }, nota) : null, g.length ? g.map(gr => h('details', { open: true }, h('summary', null, `${gr.clave} — ${gr.items.length} registros`), gr.items.map(filaItem))) : h('p', { class: 'suave peq' }, 'Ninguno.'));
  cont.appendChild(grupo('Inventarios repetidos en el lote', a.duplicados.porInv, 'El mismo número de inventario capturado más de una vez (solo puede pasar si se forzó la captura).'));
  cont.appendChild(grupo('BNI repetidos', a.duplicados.porBni));
  cont.appendChild(grupo('Series repetidas', a.duplicados.porSerie, 'Dos bienes distintos con el mismo número de serie: revisa físicamente cuál es el correcto.'));
  cont.appendChild(grupo('Posibles duplicados (mismo tipo, marca y modelo, sin serie)', a.duplicados.sospechosos, 'No necesariamente son duplicados; sirve para verificar con la foto.'));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, `Bienes con alertas (${a.conAlertas.length})`), a.conAlertas.length ? a.conAlertas.map(filaItem) : h('p', { class: 'suave peq' }, 'Ninguno.')));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Bienes por clasificación'), h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, h('th', null, 'Clasificación'), h('th', null, 'Cantidad'))), h('tbody', null, Object.entries(a.porClase).sort((x, y) => y[1] - x[1]).map(([k, n]) => h('tr', null, h('td', null, nombreClase(k)), h('td', { class: 'num' }, n))))))));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Capturas por usuario'), h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, h('th', null, 'Usuario'), h('th', null, 'Bienes'))), h('tbody', null, Object.entries(a.porUsuario).sort((x, y) => y[1] - x[1]).map(([k, n]) => h('tr', null, h('td', null, k), h('td', { class: 'num' }, n))))))));
  return cont;
}

// ============================================================ avalúo
async function vistaAvaluo() {
  const lote = loteActual();
  if (!lote) return h('div', { class: 'tarjeta' }, h('p', null, 'No hay lote seleccionado.'));
  const av = await api('GET', `/api/lotes/${lote.id}/avaluo`);
  const valores = { ...(lote.valores || {}) };
  const cont = h('div');
  const totalEl = h('b');
  const letraEl = h('span', { class: 'peq suave' });
  const filas = av.porClase.map(e => {
    const totalFila = h('td', { class: 'num' }, fmtDinero(e.total));
    const inp = h('input', { type: 'number', min: 0, step: '0.01', value: e.valor, style: { width: '110px', textAlign: 'right' }, oninput: ev => { const v = Number(ev.target.value) || 0; valores[e.clas] = v; e.valor = v; e.total = Math.round(e.cantidad * v * 100) / 100; totalFila.textContent = fmtDinero(e.total); recalcular(); } });
    return h('tr', null, h('td', null, e.num), h('td', null, e.tipo, h('div', { class: 'mini suave' }, e.nombre)), h('td', { class: 'mono' }, e.numeral), h('td', { class: 'num' }, e.cantidad), h('td', null, inp), totalFila);
  });
  function recalcular() { const t = av.porClase.reduce((s, e) => s + e.total, 0); totalEl.textContent = fmtDinero(t); letraEl.textContent = ''; }
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, `Avalúo de ${lote.nombre}`,
    h('div', { class: 'fila' }, h('button', { class: 'btn gris chico', onclick: () => { for (const e of av.porClase) { const c = clases().find(x => x.clave === e.clas); if (c) { delete valores[e.clas]; } } irA('#/avaluo'); } }, 'Restablecer valores de configuración'), h('button', { class: 'btn', onclick: async () => { try { await api('PUT', `/api/lotes/${lote.id}`, { valores }); toast('Valores guardados', 'ok'); await cargarLotes(); irA('#/avaluo'); } catch (e) { toast(e.message, 'error'); } } }, '💾 Guardar valores'))),
    h('p', { class: 'peq suave' }, 'El valor unitario por clasificación se precarga desde Configuración (valores del avalúo anterior). Aquí puedes ajustarlos solo para este lote.'),
    h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, h('th', null, 'Núm.'), h('th', null, 'Tipo de bien'), h('th', null, 'Numeral'), h('th', null, 'Cantidad'), h('th', null, 'Valor unitario'), h('th', null, 'Costo total'))),
      h('tbody', null, filas, h('tr', null, h('td', { colspan: 3 }, h('b', null, 'TOTAL')), h('td', { class: 'num' }, h('b', null, av.totales.total)), h('td'), h('td', { class: 'num' }, totalEl))))),
    h('p', null, letraEl)));
  totalEl.textContent = fmtDinero(av.totales.importe); letraEl.textContent = `(${av.importeLetra})`;
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Resumen'), h('div', { class: 'kpi' },
    h('div', null, h('b', null, av.totales.inv), h('small', null, 'inventariables')), h('div', null, h('b', null, av.totales.bni), h('small', null, 'con etiqueta BNI')), h('div', null, h('b', null, av.totales.nr), h('small', null, 'no registrados')), h('div', null, h('b', null, av.totales.total), h('small', null, 'total de bienes')))));
  return cont;
}

// ============================================================ documentos y datos del lote
function campoObj(obj, k, etiqueta, extra = {}) {
  const tipo = extra.type || 'text';
  const el = tipo === 'textarea' ? h('textarea', { oninput: e => obj[k] = e.target.value, rows: extra.rows || 3 }, obj[k] == null ? '' : obj[k]) : h('input', { type: tipo, value: obj[k] == null ? '' : obj[k], placeholder: extra.placeholder || '', oninput: e => obj[k] = tipo === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value });
  return h('label', { class: 'campo' }, h('span', null, etiqueta), el);
}
function listaPersonas(lista, campos) {
  const cont = h('div', { class: 'lista-personas' });
  const pintar = () => { cont.innerHTML = ''; lista.forEach((p, i) => cont.appendChild(h('div', { class: 'persona' }, campos.map(([k, ph]) => h('input', { type: 'text', placeholder: ph, value: p[k] || '', oninput: e => p[k] = e.target.value })), h('div', { class: 'fila' }, h('button', { class: 'btn-icono', title: 'Subir', onclick: () => { if (i > 0) { [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; pintar(); } } }, '▲'), h('button', { class: 'btn-icono', title: 'Quitar', onclick: () => { lista.splice(i, 1); pintar(); } }, '🗑'))))); cont.appendChild(h('button', { class: 'btn gris chico', onclick: () => { lista.push({}); pintar(); } }, '+ Agregar')); };
  pintar();
  return cont;
}
async function vistaDocumentos() {
  const lote0 = loteActual();
  if (!lote0) return h('div', { class: 'tarjeta' }, h('p', null, 'No hay lote seleccionado.'));
  const lote = JSON.parse(JSON.stringify(lote0));
  lote.oficio = lote.oficio || {}; lote.acta = lote.acta || {}; lote.avaluo = lote.avaluo || {}; lote.firmante = lote.firmante || {}; lote.perito = lote.perito || {};
  lote.acta.asistentes = lote.acta.asistentes || []; lote.acta.auditores = lote.acta.auditores || []; lote.oficio.ccp = lote.oficio.ccp || [];
  const cont = h('div');
  const guardar = async () => { try { await api('PUT', `/api/lotes/${lote.id}`, { nombre: lote.nombre, numero: lote.numero, anio: lote.anio, estado: lote.estado, oficio: lote.oficio, firmante: lote.firmante, perito: lote.perito, acta: lote.acta, avaluo: lote.avaluo }); await cargarLotes(); toast('Datos del lote guardados', 'ok'); } catch (e) { toast(e.message, 'error'); } };
  const docs = h('div', { class: 'tarjeta' }, h('h2', null, 'Generar documentos'),
    h('p', { class: 'peq suave' }, 'Los documentos se generan con los bienes activos del lote y los datos de abajo. Guarda los datos antes de generar.'),
    h('div', { class: 'fila' },
      h('button', { class: 'btn', onclick: async () => { await guardar(); descargar(`/api/lotes/${lote.id}/documento/oficio`); } }, '📄 Oficio (Word)'),
      h('button', { class: 'btn', onclick: async () => { await guardar(); descargar(`/api/lotes/${lote.id}/documento/acta`); } }, '📄 Acta administrativa (Word)'),
      h('button', { class: 'btn', onclick: async () => { await guardar(); descargar(`/api/lotes/${lote.id}/documento/avaluo`); } }, '📄 Avalúo (Word)'),
      h('button', { class: 'btn sec', onclick: () => descargar(`/api/lotes/${lote.id}/excel`) }, '📊 Relación (Excel)'),
      h('button', { class: 'btn sec', onclick: async () => { const r = await api('GET', `/api/lotes/${lote.id}`); imprimirEtiquetas(lote, r.items.filter(i => !i.excluido)); } }, '🏷 Etiquetas Avery 5163'),
      h('button', { class: 'btn sec', onclick: () => imprimirConteo(lote) }, '🖨 Hoja de conteo'),
    ));
  cont.appendChild(docs);
  const sec = (titulo, ...hijos) => h('details', { class: 'tarjeta', open: true }, h('summary', null, titulo), h('div', { class: 'col mt' }, hijos));
  cont.appendChild(sec('Datos generales del lote',
    h('div', { class: 'grid3' }, campoObj(lote, 'nombre', 'Nombre del lote'), campoObj(lote, 'numero', 'Número de enajenación', { type: 'number' }), campoObj(lote, 'anio', 'Año', { type: 'number' })),
    h('label', { class: 'campo' }, h('span', null, 'Estado del lote'), h('select', { onchange: e => lote.estado = e.target.value }, [['abierto', 'Abierto (se puede capturar)'], ['cerrado', 'Cerrado (solo consulta y documentos)']].map(([v, t]) => h('option', { value: v, selected: lote.estado === v }, t)))),
  ));
  cont.appendChild(sec('Oficio de solicitud',
    h('div', { class: 'grid2' }, campoObj(lote.oficio, 'numero', 'Número de oficio', { placeholder: '48001/622/2026' }), campoObj(lote.oficio, 'fecha', 'Fecha del oficio', { type: 'date' })),
    h('div', { class: 'grid3' }, campoObj(lote.oficio, 'destinatarioTitulo', 'Título del destinatario', { placeholder: 'MAESTRO' }), campoObj(lote.oficio, 'destinatario', 'Destinatario'), campoObj(lote.oficio, 'destinatarioCargo', 'Cargo del destinatario')),
    h('div', { class: 'grid3' }, campoObj(lote.firmante, 'titulo', 'Título de quien firma (opcional)'), campoObj(lote.firmante, 'nombre', 'Firma (nombre)'), campoObj(lote.firmante, 'cargo', 'Cargo')),
    h('label', { class: 'campo' }, h('span', null, 'c.c.p. (una por línea)'), h('textarea', { rows: 2, oninput: e => lote.oficio.ccp = e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }, lote.oficio.ccp.join('\n'))),
    campoObj(lote.oficio, 'iniciales', 'Iniciales', { placeholder: 'JJDO/eag' }),
  ));
  cont.appendChild(sec('Acta administrativa (inspección física)',
    h('div', { class: 'grid3' }, campoObj(lote.acta, 'fecha', 'Fecha del acta', { type: 'date' }), campoObj(lote.acta, 'horaInicio', 'Hora de inicio', { type: 'time' }), campoObj(lote.acta, 'horaFin', 'Hora de conclusión (vacío = líneas para llenar a mano)', { type: 'time' })),
    campoObj(lote.acta, 'lugar', 'Lugar (como se redacta en el acta: "la bodega del Departamento…")', { type: 'textarea', rows: 2 }),
    h('div', { class: 'grid3' }, campoObj(lote.acta, 'oficioSolicitud', 'Oficio de solicitud a Contraloría'), campoObj(lote.acta, 'fechaOficioSolicitud', 'Fecha de ese oficio', { type: 'date' }), campoObj(lote.acta, 'solicitante', 'Quien solicitó (p. ej. "el Secretario de Administración y Finanzas")')),
    h('div', { class: 'grid3' }, campoObj(lote.acta, 'nBienesInspeccion', 'Bienes a inspeccionar según el oficio (vacío = total del lote)', { type: 'number' }), campoObj(lote.acta, 'fechaInspeccion', 'Fecha de la inspección', { type: 'date' }), campoObj(lote.acta, 'horaInspeccion', 'Hora de la inspección', { type: 'time' })),
    h('div', { class: 'grid3' }, campoObj(lote.acta, 'oficioDesignacion', 'Oficio de designación del perito'), campoObj(lote.acta, 'fechaDesignacion', 'Fecha de designación', { type: 'date' }), campoObj(lote.acta, 'designadoPor', 'Designado por (nombre con título)')),
    h('div', { class: 'grid2' }, campoObj(lote.acta, 'designadoPorCargo', 'Cargo de quien designó'), campoObj(lote.acta, 'adscripcionAsistentes', 'Adscripción de los asistentes de la SAF')),
    h('div', null, h('b', { class: 'peq' }, 'Asistentes por la SAF (nombre, cargo, gafete)'), listaPersonas(lote.acta.asistentes, [['nombre', 'Nombre'], ['cargo', 'Cargo'], ['gafete', 'Núm. de gafete']])),
    campoObj(lote.acta, 'adscripcionAuditores', 'Adscripción de los auditores (como se redacta: "al Departamento de…")'),
    h('div', null, h('b', { class: 'peq' }, 'Auditores de la Contraloría (nombre, cargo, gafete)'), listaPersonas(lote.acta.auditores, [['nombre', 'Nombre'], ['cargo', 'Cargo'], ['gafete', 'Núm. de gafete']])),
  ));
  cont.appendChild(sec('Avalúo',
    h('div', { class: 'grid4' }, campoObj(lote.perito, 'titulo', 'Título del perito', { placeholder: 'Mtro.' }), campoObj(lote.perito, 'nombre', 'Perito valuador (nombre)'), campoObj(lote.perito, 'cargo', 'Cargo (firma)'), campoObj(lote.perito, 'cargoLargo', 'Cargo (en texto corrido)')),
    h('div', { class: 'grid2' }, campoObj(lote.avaluo, 'fojas', 'Fojas del expediente adjunto', { type: 'number' }), campoObj(lote.avaluo, 'lugar', 'Lugar donde se encuentran los bienes (texto corrido)', { type: 'textarea', rows: 2 })),
    h('p', { class: 'peq suave' }, 'Los valores unitarios se ajustan en la pestaña Avalúo.'),
  ));
  cont.appendChild(h('div', { class: 'pie-fijo no-imprimir' }, h('button', { class: 'btn', onclick: guardar }, '💾 Guardar datos del lote')));
  return cont;
}

// ============================================================ etiquetas Avery 5163 y hoja de conteo
function qrSvg(texto, tam) {
  try { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }).replace('<svg', `<svg width="${tam}" height="${tam}"`); } catch (e) { return ''; }
}
function imprimirEtiquetas(lote, items) {
  if (!items.length) return toast('No hay bienes para etiquetar');
  const cfg = (estado.config && estado.config.etiqueta) || {};
  const opciones = { omitir: 0, tipos: { INV: true, BNI: true, NR: true }, orden: 'clas' };
  const form = h('div', { class: 'col' },
    h('p', { class: 'peq suave' }, `Hoja carta, Avery 5163 (10 etiquetas de 2" × 4" por hoja). ${items.length} bienes en el lote.`),
    h('div', { class: 'grid2' },
      h('label', { class: 'campo' }, h('span', null, 'Saltar etiquetas ya usadas en la primera hoja'), h('input', { type: 'number', min: 0, max: 9, value: 0, oninput: e => opciones.omitir = Number(e.target.value) || 0 })),
      h('label', { class: 'campo' }, h('span', null, 'Orden'), h('select', { onchange: e => opciones.orden = e.target.value }, h('option', { value: 'clas' }, 'Por clasificación (como en el documento)'), h('option', { value: 'captura' }, 'Por orden de captura')))),
    h('div', { class: 'fila' }, ['INV', 'BNI', 'NR'].map(k => h('label', { class: 'peq fila' }, h('input', { type: 'checkbox', checked: true, onchange: e => opciones.tipos[k] = e.target.checked }), { INV: 'Inventariables', BNI: 'BNI', NR: 'No registrados (una por grupo)' }[k]))),
    h('div', { class: 'acciones' }, h('button', { class: 'btn gris', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { class: 'btn', onclick: () => { m.cerrar(); generar(); } }, '🖨 Generar e imprimir')));
  const m = modal(form, { titulo: 'Etiquetas Avery 5163' });
  function generar() {
    const orden = new Map(clases().map((c, i) => [c.clave, i]));
    let lista = items.filter(i => opciones.tipos[i.tipoItem]);
    if (opciones.orden === 'clas') lista = [...lista].sort((a, b) => (orden.get(a.clas) ?? 999) - (orden.get(b.clas) ?? 999) || String(a.fechaCaptura).localeCompare(String(b.fechaCaptura)));
    // Numeración consecutiva de inventariables (misma que en documentos: por clasificación)
    const invOrdenados = items.filter(i => i.tipoItem === 'INV').sort((a, b) => (orden.get(a.clas) ?? 999) - (orden.get(b.clas) ?? 999) || String(a.fechaCaptura).localeCompare(String(b.fechaCaptura)));
    const numInv = new Map(invOrdenados.map((it, i) => [it.id, i + 1]));
    const etiquetas = [];
    for (let i = 0; i < opciones.omitir; i++) etiquetas.push(null);
    for (const it of lista) {
      const num = it.tipoItem === 'INV' ? numInv.get(it.id) : null;
      const codigo = it.inv || it.bni || `NR-${(it.nombre || '').toUpperCase()}`;
      const qr = qrSvg(JSON.stringify({ l: lote.nombre, n: num, i: it.inv || it.bni || null, t: it.nombre }), 110);
      etiquetas.push(`<div class="etq"><div class="txt"><div class="tit">${esc(cfg.titulo || 'ENAJENACIÓN DE BIENES INFORMÁTICOS')}</div><div class="lote">${esc(lote.nombre)}${num ? ` · Núm. <b>${num}</b>` : ''}</div>
        <div class="inv">${esc(codigo)}</div><div class="tipo">${esc(it.nombre || '')}${it.tipoItem === 'NR' ? ` × ${it.cantidad}` : ''}</div>
        <div class="det">${esc([it.marca, it.modelo].filter(Boolean).join(' '))}</div><div class="det">Serie: ${esc(it.serie || (it.tipoItem === 'NR' ? '—' : 'SIN NÚMERO'))}</div>
        <div class="pie">${esc(cfg.subtitulo || 'Dirección de Informática')} · ${esc(it.estado || 'Desuso')}</div></div><div class="qr">${qr}</div></div>`);
    }
    const hojas = [];
    for (let i = 0; i < etiquetas.length; i += 10) {
      const grupo = etiquetas.slice(i, i + 10);
      hojas.push(`<div class="hoja">${grupo.map((e, j) => `<div class="pos" style="left:${(0.15625 + (j % 2) * 4.1875).toFixed(4)}in;top:${(0.5 + Math.floor(j / 2) * 2)}in">${e || ''}</div>`).join('')}</div>`);
    }
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas ${esc(lote.nombre)}</title><style>
      @page { size: letter; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #000; }
      .hoja { width: 8.5in; height: 11in; position: relative; page-break-after: always; overflow: hidden; }
      .pos { position: absolute; width: 4in; height: 2in; }
      .etq { width: 4in; height: 2in; box-sizing: border-box; padding: .13in .16in .1in .18in; display: flex; gap: .1in; overflow: hidden; }
      .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .tit { font-size: 7.5pt; font-weight: 700; letter-spacing: .3px; color: #8c1d40; }
      .lote { font-size: 8pt; margin-top: 1px; }
      .inv { font-size: 22pt; font-weight: 800; font-family: Arial, sans-serif; letter-spacing: 1px; margin: 3px 0 1px; line-height: 1; white-space: nowrap; overflow: hidden; }
      .tipo { font-size: 10pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .det { font-size: 8.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pie { font-size: 6.5pt; color: #555; margin-top: auto; }
      .qr { width: 1.2in; display: flex; align-items: center; justify-content: center; } .qr svg { width: 1.15in; height: 1.15in; }
      .aviso { position: fixed; top: 0; left: 0; right: 0; background: #ffe; border-bottom: 1px solid #cc9; padding: 6px 12px; font-size: 13px; } @media print { .aviso { display: none; } }
      @media screen { body { background: #888; } .hoja { margin: 20px auto; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,.4); } .etq { outline: 1px dashed #bbb; } }
    </style></head><body><div class="aviso">Imprime a tamaño real (escala 100 %, sin "ajustar a la página"), hoja carta, con la hoja de etiquetas Avery 5163. ${etiquetas.length - opciones.omitir} etiquetas en ${hojas.length} hoja(s). <button onclick="window.print()">Imprimir</button></div>${hojas.join('')}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return toast('El navegador bloqueó la ventana emergente; permite ventanas emergentes para este sitio', 'error');
    w.document.open(); w.document.write(html); w.document.close();
  }
}
async function imprimirConteo(lote) {
  const r = await api('GET', `/api/lotes/${lote.id}/relacion`);
  const fila = (n, a, b, c, d, e) => `<tr><td>${n}</td><td class="m">${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td><td class="m">${esc(d)}</td><td>${esc(e)}</td><td class="ck">☐</td><td></td></tr>`;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Hoja de conteo ${esc(lote.nombre)}</title><style>
    @page { size: letter; margin: .6in .5in; } body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; }
    h1 { font-size: 13pt; margin: 0 0 2px; } h2 { font-size: 10pt; margin: 14px 0 4px; } p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #999; padding: 3px 4px; vertical-align: top; } th { background: #e8e8e8; font-size: 8.5pt; }
    td.m { font-family: Consolas, Menlo, monospace; } td.ck { font-size: 13pt; text-align: center; width: 28px; } tr { page-break-inside: avoid; } thead { display: table-header-group; }
    .firmas { display: flex; justify-content: space-around; margin-top: 40px; } .firmas div { width: 40%; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 8.5pt; }
    @media print { button { display: none; } }
  </style></head><body>
    <button onclick="window.print()">Imprimir</button>
    <h1>Hoja de conteo para inspección física — ${esc(lote.nombre)}</h1>
    <p>Poder Legislativo del Estado de México · Dirección de Informática · Generado ${new Date().toLocaleString('es-MX')}</p>
    <p>Inventariables: <b>${r.totales.inv}</b> · BNI: <b>${r.totales.bni}</b> · No registrados: <b>${r.totales.nr}</b> · Total: <b>${r.totales.total}</b></p>
    <h2>Bienes informáticos inventariables</h2>
    <table><thead><tr><th>Núm.</th><th>Inventario</th><th>Tipo</th><th>Marca / modelo</th><th>Serie</th><th>Clasificación</th><th>✓</th><th style="width:1.6in">Observaciones</th></tr></thead><tbody>
    ${r.inv.map(i => fila(i.num, i.inv, i.nombre, [i.marca, i.modelo].filter(Boolean).join(' '), i.serie, nombreClase(i.clas))).join('')}</tbody></table>
    <h2>Bienes con etiqueta BNI</h2>
    <table><thead><tr><th>Núm.</th><th>BNI</th><th>Nombre</th><th>Descripción</th><th>Serie</th><th>Clasificación</th><th>✓</th><th style="width:1.6in">Observaciones</th></tr></thead><tbody>
    ${r.bni.map(i => fila(i.num, i.bni, i.nombre, i.descripcion || '', i.serie || '', nombreClase(i.clas))).join('') || '<tr><td colspan="8">Ninguno</td></tr>'}</tbody></table>
    <h2>Bienes no registrados</h2>
    <table><thead><tr><th>Núm.</th><th>Cantidad</th><th>Nombre</th><th>Clasificación</th><th>Contados</th><th>✓</th><th style="width:1.6in">Observaciones</th></tr></thead><tbody>
    ${r.nr.map(e => `<tr><td>${e.num}</td><td>${e.cantidad}</td><td>${esc(e.nombre)}</td><td>${esc(nombreClase(e.clas))}</td><td></td><td class="ck">☐</td><td></td></tr>`).join('') || '<tr><td colspan="7">Ninguno</td></tr>'}</tbody></table>
    <div class="firmas"><div>Por la Dirección de Informática</div><div>Por la Contraloría</div></div>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir', 'error');
  w.document.open(); w.document.write(html); w.document.close();
}

// ============================================================ catálogo
async function vistaCatalogo() {
  const est = await api('GET', '/api/catalogo/estado');
  const cont = h('div');
  const tarjetaCatalogo = (tipo, titulo, e, ayuda) => {
    const progreso = h('div', { class: 'progreso oculto' }, h('div'));
    const msg = h('p', { class: 'peq suave' });
    const inputArchivo = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', onchange: async ev => {
      const f = ev.target.files[0]; if (!f) return;
      if (!await confirmar(`Se reemplazará el catálogo de ${titulo.toLowerCase()} (${e.bienes.toLocaleString()} bienes) con el contenido de "${f.name}". Los lotes capturados no se modifican. ¿Continuar?`)) { ev.target.value = ''; return; }
      progreso.classList.remove('oculto'); $('div', progreso).style.width = '30%'; msg.textContent = 'Subiendo y procesando… (puede tardar un minuto)';
      try {
        const r = await api('POST', `/api/catalogo/importar?tipo=${tipo}`, f, { nombre: f.name });
        $('div', progreso).style.width = '100%';
        toast(`Catálogo importado: ${r.bienes.toLocaleString()} bienes`, 'ok');
        const notas = [];
        const sinMapear = r.columnas.filter(c => !c.campo).map(c => c.encabezado);
        if (sinMapear.length) notas.push('Columnas no reconocidas (se ignoraron): ' + sinMapear.join(', '));
        if (r.corregidos && r.corregidos.length) notas.push(`Números corregidos (${r.corregidos.length}): ` + r.corregidos.join(', '));
        msg.textContent = notas.join(' · ');
        estado.catalogo = null; setTimeout(() => irA('#/catalogo'), notas.length ? 5000 : 800);
      } catch (err) { toast(err.message, 'error'); msg.textContent = err.message; progreso.classList.add('oculto'); ev.target.value = ''; }
    } });
    return h('div', { class: 'tarjeta' }, h('h2', null, titulo),
      h('div', { class: 'kpi' },
        h('div', null, h('b', null, e.bienes.toLocaleString()), h('small', null, 'bienes')),
        h('div', null, h('b', null, e.enBodega.toLocaleString()), h('small', null, 'en bodega de informática')),
        h('div', null, h('b', null, e.candidatos.toLocaleString()), h('small', null, 'en bodega sin baja definitiva')),
        h('div', null, h('b', null, e.fecha ? new Date(e.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'), h('small', null, e.archivo || 'sin importar'))),
      Object.keys(e.condicionesBodega || {}).length ? h('div', { class: 'mt peq' }, h('b', null, 'Condición en bodega: '), Object.entries(e.condicionesBodega).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: 'chip gris', style: { margin: '2px' } }, `${k}: ${v.toLocaleString()}`))) : null,
      esAdmin() ? h('div', { class: 'mt col' }, h('p', { class: 'peq' }, ayuda), inputArchivo, progreso, msg) : h('p', { class: 'peq suave mt' }, 'Solo un administrador puede importar el catálogo.'),
      h('div', { class: 'fila mt' }, h('button', { class: 'btn sec chico', onclick: () => descargar(`/api/catalogo/excel?tipo=${tipo}&bodega=1&candidatos=1`) }, '⬇ Excel: candidatos en bodega'), h('button', { class: 'btn sec chico', onclick: () => descargar(`/api/catalogo/excel?tipo=${tipo}&bodega=1`) }, '⬇ Excel: todo lo de bodega')));
  };
  cont.appendChild(tarjetaCatalogo('inv', 'Bienes inventariables (A#####)', est, 'Importa el reporte de bienes del sistema de Bienes Muebles (Excel). Se detectan las columnas por su encabezado (numero_inventario, nombre_bien, marca, modelo, numero_serie, condicion_bien_id, Servidor público, Adscripción…).'));
  cont.appendChild(tarjetaCatalogo('bni', 'Bienes de bajo costo (BNI)', est.bni || { bienes: 0, enBodega: 0, candidatos: 0 }, 'Importa el reporte de bienes de bajo costo (reporte-bienes-bajo-costo). Al escanear una etiqueta BNI se consultan aquí su condición y resguardante, con las mismas alertas y bloqueos que los inventariables. Los números mal capturados en el sistema (BN1…, BIN…, bni…) se corrigen a BNI….'));
  const resultados = h('div', { class: 'tabla-wrap' });
  let timer;
  const buscador = h('input', { type: 'search', placeholder: 'Buscar por inventario, serie, nombre, marca, resguardante…', oninput: e => { clearTimeout(timer); timer = setTimeout(() => buscar(e.target.value), 300); } });
  const soloBodega = h('input', { type: 'checkbox', onchange: () => buscar(buscador.value) });
  async function buscar(q) {
    if (!q && !soloBodega.checked) { resultados.innerHTML = ''; return; }
    const lista = await api('GET', `/api/catalogo/buscar?q=${encodeURIComponent(q)}&bodega=${soloBodega.checked ? 1 : 0}&limite=200`);
    resultados.innerHTML = '';
    resultados.appendChild(h('p', { class: 'peq suave' }, `${lista.length} resultados${lista.length >= 200 ? ' (mostrando los primeros 200)' : ''}`));
    resultados.appendChild(h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Inventario', 'Bien', 'Marca', 'Modelo', 'Serie', 'Condición', 'Registro', 'Resguardante', 'Adscripción', 'Valor', 'Fecha reg.', 'Clasif.'].map(t => h('th', null, t)))),
      h('tbody', null, lista.map(b => h('tr', null, h('td', { class: 'mono' }, b.inv), h('td', null, b.nombre), h('td', null, b.marca), h('td', null, b.modelo), h('td', { class: 'mono' }, b.serie), h('td', null, h('span', { class: 'chip ' + (/BAJA/i.test(b.cond || '') ? 'rojo' : /FUNCION/i.test(b.cond || '') ? 'verde' : 'amarillo') }, b.cond || '—')), h('td', null, b.treg), h('td', null, b.resg), h('td', { class: 'mini' }, b.ads), h('td', { class: 'num' }, fmtDinero(b.valor)), h('td', null, b.freg), h('td', { class: 'mini' }, nombreClase(b.clas)))))));
  }
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, 'Consultar catálogo'), h('div', { class: 'fila' }, h('div', { class: 'crece' }, buscador), h('label', { class: 'peq fila' }, soloBodega, 'Solo bodega de informática')), resultados));
  return cont;
}

// ============================================================ lista de bloqueo
async function vistaBloqueos() {
  const lista = await api('GET', '/api/bloqueos');
  const cont = h('div');
  const sel = new Set();
  if (esAdmin()) {
    const txt = h('textarea', { rows: 6, placeholder: 'Pega aquí los números (uno por línea, o separados por coma o espacio). Puedes copiar una columna de Excel.\nA36417\nA47729\nBNI0544' });
    const motivo = h('input', { type: 'text', placeholder: 'Ej. Equipo reservado para donación / En proceso con Contraloría / Ya enajenado en 2025' });
    const res = h('div');
    const conteo = h('span', { class: 'peq suave' }, '0 números detectados');
    txt.addEventListener('input', () => { const n = new Set(txt.value.toUpperCase().split(/[\s,;|]+/).filter(c => c.length >= 3)).size; conteo.textContent = `${n} números detectados`; });
    const archivo = h('input', { type: 'file', accept: '.txt,.csv', onchange: async e => { const f = e.target.files[0]; if (f) { txt.value += (txt.value ? '\n' : '') + await f.text(); txt.dispatchEvent(new Event('input')); } } });
    cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, 'Agregar a la lista de bloqueo'),
      h('p', { class: 'peq suave' }, 'Los números de esta lista no se pueden registrar en ningún lote: al escanearlos aparece la pantalla roja "NO SE PUEDE REGISTRAR" con el motivo. Si alguno ya estaba capturado, aparecerá con alerta roja en Bienes del lote y en Análisis.'),
      h('label', { class: 'campo' }, h('span', null, 'Números de inventario o BNI'), txt), h('div', { class: 'fila' }, conteo, h('span', { class: 'peq suave' }, '· o carga un .txt/.csv:'), archivo),
      h('label', { class: 'campo' }, h('span', null, 'Motivo (se muestra en la alerta)'), motivo),
      h('div', { class: 'fila' }, h('button', { class: 'btn', onclick: async () => {
        try {
          const r = await api('POST', '/api/bloqueos', { codigos: txt.value, motivo: motivo.value });
          res.innerHTML = '';
          res.appendChild(h('div', { class: 'alerta grande verde' }, `Agregados: ${r.agregados} · Motivo actualizado: ${r.actualizados} · Ya estaban: ${r.repetidos}`));
          if (r.yaCapturados.length) res.appendChild(h('div', { class: 'alerta grande rojo' }, `Ya estaban capturados en algún lote (revísalos y exclúyelos): ${r.yaCapturados.join(', ')}`));
          if (r.noEnCatalogo.length) res.appendChild(h('div', { class: 'alerta amarillo' }, `No están en el catálogo (se bloquean igual; revisa si están bien escritos): ${r.noEnCatalogo.join(', ')}`));
          txt.value = ''; conteo.textContent = '0 números detectados';
          setTimeout(() => irA('#/bloqueos'), r.yaCapturados.length || r.noEnCatalogo.length ? 6000 : 1200);
        } catch (e) { toast(e.message, 'error'); }
      } }, '⛔ Agregar a la lista')), res));
  }
  const tabla = h('div', { class: 'tabla-wrap' });
  let q = '';
  const pintar = () => {
    const l = lista.filter(b => !q || `${b.codigo} ${b.motivo} ${b.nombre} ${b.resg}`.toUpperCase().includes(q));
    tabla.innerHTML = '';
    tabla.appendChild(h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['', 'Inventario', 'Motivo', 'Bien (catálogo)', 'Condición', 'Resguardante', 'Capturado en', 'Agregó', 'Fecha'].map(t => h('th', null, t)))),
      h('tbody', null, l.map(b => h('tr', null,
        h('td', null, esAdmin() ? h('input', { type: 'checkbox', checked: sel.has(b.codigo), onchange: e => e.target.checked ? sel.add(b.codigo) : sel.delete(b.codigo) }) : ''),
        h('td', { class: 'mono' }, h('b', null, b.codigo)), h('td', null, b.motivo || h('span', { class: 'suave' }, '—')),
        h('td', null, b.enCatalogo ? b.nombre : h('span', { class: 'chip amarillo' }, 'No está en catálogo')), h('td', null, b.cond), h('td', { class: 'mini' }, b.resg),
        h('td', null, b.capturadoEn.length ? h('span', { class: 'chip rojo' }, b.capturadoEn.join(', ')) : ''),
        h('td', null, b.agregadoPor), h('td', { class: 'mini' }, fmtFecha(b.fecha)))))));
  };
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, `Lista de bloqueo (${lista.length})`, h('div', { class: 'fila' },
    h('button', { class: 'btn sec chico', onclick: () => descargar('/api/bloqueos/excel') }, '⬇ Excel'),
    esAdmin() ? h('button', { class: 'btn peligro chico', onclick: async () => { if (!sel.size) return toast('Selecciona números con las casillas'); if (!await confirmar(`¿Quitar ${sel.size} números de la lista de bloqueo? Se podrán volver a registrar.`)) return; await api('POST', '/api/bloqueos/eliminar', { codigos: [...sel] }); toast('Quitados', 'ok'); irA('#/bloqueos'); } }, 'Quitar seleccionados') : null)),
    h('input', { type: 'search', placeholder: 'Buscar número, motivo, bien…', style: { maxWidth: '340px' }, oninput: e => { q = e.target.value.toUpperCase(); pintar(); } }),
    h('div', { class: 'mt' }, tabla)));
  pintar();
  return cont;
}

// ============================================================ usuarios
async function vistaUsuarios() {
  const lista = await api('GET', '/api/usuarios');
  const cont = h('div');
  const formUsuario = (u) => {
    const d = u ? { ...u } : { usuario: '', nombre: '', rol: 'captura', password: '' };
    const f = h('form', { class: 'col', onsubmit: async e => {
      e.preventDefault();
      try { if (u) await api('PUT', `/api/usuarios/${u.id}`, { nombre: d.nombre, rol: d.rol, activo: d.activo, password: d.password || undefined }); else await api('POST', '/api/usuarios', d); m.cerrar(); toast('Guardado', 'ok'); irA('#/usuarios'); }
      catch (err) { toast(err.message, 'error'); }
    } },
      u ? h('p', null, 'Usuario: ', h('b', null, u.usuario)) : h('label', { class: 'campo' }, h('span', null, 'Usuario (para entrar)'), h('input', { type: 'text', required: true, autocapitalize: 'none', pattern: '[a-z0-9._\\-]{2,30}', oninput: e => d.usuario = e.target.value.toLowerCase() })),
      h('label', { class: 'campo' }, h('span', null, 'Nombre completo'), h('input', { type: 'text', value: d.nombre, required: true, oninput: e => d.nombre = e.target.value })),
      h('label', { class: 'campo' }, h('span', null, 'Rol'), h('select', { onchange: e => d.rol = e.target.value, disabled: u && u.id === estado.usuario.id }, h('option', { value: 'captura', selected: d.rol === 'captura' }, 'Captura (levantamiento y consulta)'), h('option', { value: 'admin', selected: d.rol === 'admin' }, 'Administrador (todo)'))),
      u ? h('label', { class: 'peq fila' }, h('input', { type: 'checkbox', checked: d.activo !== false, disabled: u.id === estado.usuario.id, onchange: e => d.activo = e.target.checked }), 'Usuario activo') : null,
      h('label', { class: 'campo' }, h('span', null, u ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña inicial'), h('input', { type: 'password', autocomplete: 'new-password', minlength: 4, required: !u, oninput: e => d.password = e.target.value })),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn gris', onclick: () => m.cerrar() }, 'Cancelar'), h('button', { type: 'submit', class: 'btn' }, 'Guardar')));
    const m = modal(f, { titulo: u ? 'Editar usuario' : 'Nuevo usuario' });
  };
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h2', null, 'Usuarios', h('button', { class: 'btn', onclick: () => formUsuario(null) }, '+ Nuevo usuario')),
    h('p', { class: 'peq suave' }, 'Cada persona entra con su usuario; en cada bien queda registrado quién lo capturó y quién lo modificó. Al crear un usuario o restablecer su contraseña se le pedirá cambiarla al entrar.'),
    h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Usuario', 'Nombre', 'Rol', 'Activo', 'Último acceso', ''].map(t => h('th', null, t)))),
      h('tbody', null, lista.map(u => h('tr', null, h('td', { class: 'mono' }, u.usuario), h('td', null, u.nombre), h('td', null, u.rol), h('td', null, u.activo ? 'Sí' : 'No'), h('td', { class: 'mini' }, fmtFecha(u.ultimoAcceso)), h('td', null, h('button', { class: 'btn-icono', onclick: () => formUsuario(u) }, '✏️')))))))));
  return cont;
}

// ============================================================ bitácora
async function vistaBitacora() {
  const lista = await api('GET', '/api/bitacora?limite=500');
  return h('div', { class: 'tarjeta' }, h('h2', null, 'Bitácora (últimos 500 movimientos)'),
    h('div', { class: 'tabla-wrap' }, h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Fecha', 'Usuario', 'Acción', 'Detalle'].map(t => h('th', null, t)))),
      h('tbody', null, lista.map(b => h('tr', null, h('td', { class: 'mini' }, fmtFecha(b.fecha)), h('td', null, b.usuario), h('td', null, h('span', { class: 'chip gris' }, b.accion)), h('td', null, b.detalle)))))));
}

// ============================================================ configuración
async function vistaConfig() {
  const cfg = JSON.parse(JSON.stringify(estado.config));
  const textosDefault = await api('GET', '/api/config/textos-default');
  cfg.textos = cfg.textos || {};
  const cont = h('div');
  const guardar = async (claves) => { try { const n = {}; for (const k of claves) n[k] = cfg[k]; estado.config = await api('PUT', '/api/config', n); toast('Configuración guardada', 'ok'); } catch (e) { toast(e.message, 'error'); } };
  // Institución
  cfg.institucion = cfg.institucion || {};
  cont.appendChild(h('details', { class: 'tarjeta', open: true }, h('summary', null, 'Institución y bodega'), h('div', { class: 'col mt' },
    h('div', { class: 'grid3' }, campoObj(cfg.institucion, 'nombre', 'Institución'), campoObj(cfg.institucion, 'area', 'Área'), campoObj(cfg.institucion, 'bodega', 'Nombre del resguardante "bodega" en el sistema (para las alertas)')),
    cfg.etiqueta = cfg.etiqueta || {}, h('div', { class: 'grid2' }, campoObj(cfg.etiqueta, 'titulo', 'Título de las etiquetas'), campoObj(cfg.etiqueta, 'subtitulo', 'Pie de las etiquetas')),
    h('div', { class: 'fila' }, h('button', { class: 'btn', onclick: () => guardar(['institucion', 'etiqueta']) }, '💾 Guardar')))));
  // Clasificaciones
  const tablaClas = h('div', { class: 'tabla-wrap' });
  const pintarClas = () => {
    tablaClas.innerHTML = '';
    tablaClas.appendChild(h('table', { class: 'tabla' }, h('thead', null, h('tr', null, ['Orden', 'Clave', 'Nombre (Clasificación general)', 'Tipo de bien (avalúo)', 'Valor unitario', 'Patrones de nombre (separados por |)', ''].map(t => h('th', null, t)))),
      h('tbody', null, cfg.clasificaciones.map((c, i) => h('tr', null,
        h('td', null, h('button', { class: 'btn-icono', onclick: () => { if (i > 0) { [cfg.clasificaciones[i - 1], cfg.clasificaciones[i]] = [cfg.clasificaciones[i], cfg.clasificaciones[i - 1]]; pintarClas(); } } }, '▲'), h('button', { class: 'btn-icono', onclick: () => { if (i < cfg.clasificaciones.length - 1) { [cfg.clasificaciones[i + 1], cfg.clasificaciones[i]] = [cfg.clasificaciones[i], cfg.clasificaciones[i + 1]]; pintarClas(); } } }, '▼')),
        h('td', null, h('input', { type: 'text', value: c.clave, style: { width: '110px' }, oninput: e => c.clave = e.target.value.toUpperCase() })),
        h('td', null, h('input', { type: 'text', value: c.nombre, oninput: e => c.nombre = e.target.value })),
        h('td', null, h('input', { type: 'text', value: c.tipo || '', oninput: e => c.tipo = e.target.value })),
        h('td', null, h('input', { type: 'number', step: '0.01', value: c.valor, style: { width: '90px' }, oninput: e => c.valor = Number(e.target.value) })),
        h('td', null, h('input', { type: 'text', value: (c.patrones || []).join(' | '), oninput: e => c.patrones = e.target.value.split('|').map(s => s.trim()).filter(Boolean) })),
        h('td', null, c.clave !== 'OTRO' ? h('button', { class: 'btn-icono', onclick: () => { cfg.clasificaciones.splice(i, 1); pintarClas(); } }, '🗑') : null))))));
  };
  pintarClas();
  cont.appendChild(h('details', { class: 'tarjeta', open: true }, h('summary', null, 'Clasificaciones y valores unitarios del avalúo'),
    h('p', { class: 'peq suave' }, 'El orden define cómo se agrupan y numeran los bienes en los documentos. Los patrones son expresiones regulares que se comparan con el nombre del bien (sin acentos, en mayúsculas) para clasificar automáticamente; gana la coincidencia más larga.'),
    tablaClas, h('div', { class: 'fila mt' }, h('button', { class: 'btn gris', onclick: () => { cfg.clasificaciones.splice(cfg.clasificaciones.length - 1, 0, { clave: 'NUEVA', nombre: 'Nueva clasificación', tipo: 'NUEVA', valor: 5, patrones: [] }); pintarClas(); } }, '+ Agregar'), h('button', { class: 'btn', onclick: () => guardar(['clasificaciones']) }, '💾 Guardar clasificaciones'))));
  // Plantilla de lote
  const pl = cfg.lotePlantilla = cfg.lotePlantilla || {}; pl.firmante = pl.firmante || {}; pl.perito = pl.perito || {}; pl.oficio = pl.oficio || {}; pl.acta = pl.acta || {}; pl.avaluo = pl.avaluo || {}; pl.oficio.ccp = pl.oficio.ccp || [];
  cont.appendChild(h('details', { class: 'tarjeta' }, h('summary', null, 'Valores por omisión para lotes nuevos (firmas, destinatario, lugar…)'), h('div', { class: 'col mt' },
    h('div', { class: 'grid3' }, campoObj(pl.firmante, 'titulo', 'Título de quien firma el oficio'), campoObj(pl.firmante, 'nombre', 'Firma del oficio (nombre)'), campoObj(pl.firmante, 'cargo', 'Cargo')),
    h('div', { class: 'grid4' }, campoObj(pl.perito, 'titulo', 'Título del perito'), campoObj(pl.perito, 'nombre', 'Perito valuador'), campoObj(pl.perito, 'cargo', 'Cargo (firma)'), campoObj(pl.perito, 'cargoLargo', 'Cargo (texto corrido)')),
    h('div', { class: 'grid3' }, campoObj(pl.oficio, 'destinatarioTitulo', 'Título del destinatario'), campoObj(pl.oficio, 'destinatario', 'Destinatario del oficio'), campoObj(pl.oficio, 'destinatarioCargo', 'Cargo del destinatario')),
    h('label', { class: 'campo' }, h('span', null, 'c.c.p. (una por línea)'), h('textarea', { rows: 2, oninput: e => pl.oficio.ccp = e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }, pl.oficio.ccp.join('\n'))),
    campoObj(pl.oficio, 'iniciales', 'Iniciales'),
    campoObj(pl.acta, 'lugar', 'Lugar del acta (texto corrido)', { type: 'textarea', rows: 2 }), campoObj(pl.avaluo, 'lugar', 'Lugar del avalúo (texto corrido)', { type: 'textarea', rows: 2 }),
    h('div', { class: 'grid2' }, campoObj(pl.acta, 'solicitante', 'Quien solicita a Contraloría'), campoObj(pl.acta, 'adscripcionAsistentes', 'Adscripción de asistentes SAF')),
    h('div', { class: 'grid3' }, campoObj(pl.acta, 'adscripcionAuditores', 'Adscripción de auditores'), campoObj(pl.acta, 'designadoPor', 'Designado por'), campoObj(pl.acta, 'designadoPorCargo', 'Cargo de quien designa')),
    h('div', { class: 'fila' }, h('button', { class: 'btn', onclick: () => guardar(['lotePlantilla']) }, '💾 Guardar')))));
  // Textos
  const secciones = h('div', { class: 'col' });
  for (const [sec, campos] of Object.entries(textosDefault)) {
    cfg.textos[sec] = cfg.textos[sec] || {};
    secciones.appendChild(h('details', null, h('summary', null, { oficio: 'Oficio', acta: 'Acta administrativa', avaluo: 'Avalúo', comunes: 'Comunes' }[sec] || sec), h('div', { class: 'col mt' }, Object.entries(campos).map(([k, v]) => {
      const esLista = Array.isArray(v);
      const actual = cfg.textos[sec][k] != null ? cfg.textos[sec][k] : v;
      return h('label', { class: 'campo' }, h('span', null, k, esLista ? ' (una viñeta por línea)' : ''), h('textarea', { rows: Math.min(8, Math.max(2, Math.ceil(String(esLista ? actual.join('\n') : actual).length / 110))), oninput: e => { const val = esLista ? e.target.value.split('\n').filter(Boolean) : e.target.value; if (JSON.stringify(val) === JSON.stringify(v)) delete cfg.textos[sec][k]; else cfg.textos[sec][k] = val; } }, esLista ? actual.join('\n') : actual));
    }))));
  }
  cont.appendChild(h('details', { class: 'tarjeta' }, h('summary', null, 'Textos de los documentos'),
    h('div', { class: 'ayuda mt' }, h('b', null, 'Variables disponibles: '), '{{N}} {{N_LETRA}} {{N_INV}} {{N_INV_LETRA}} {{N_NR}} {{N_NR_LETRA}} {{N_BNI}} {{N_SR}} {{LOTE}} {{ORDINAL}} {{ANIO}} {{FECHA_OFICIO}} {{NUM_OFICIO}} {{FECHA_ACTA_LETRA}} {{HORA_INICIO_LETRA}} {{HORA_FIN_LETRA}} {{LUGAR_ACTA}} {{LUGAR_AVALUO}} {{ASISTENTES_SAF}} {{AUDITORES}} {{OFICIO_SOLICITUD}} {{FECHA_OFICIO_SOLICITUD_LETRA}} {{SOLICITANTE}} {{N_INSPECCION_LETRA}} {{FECHA_INSPECCION_LETRA}} {{HORA_INSPECCION_LETRA}} {{PERITO}} {{PERITO_CARGO}} {{OFICIO_DESIGNACION}} {{FECHA_DESIGNACION_LETRA}} {{DESIGNADO_POR}} {{DESIGNADO_POR_CARGO}} {{TOTAL}} {{TOTAL_LETRA}} {{FOJAS}} {{DIRECTOR}} {{DIRECTOR_CARGO}}'),
    secciones, h('div', { class: 'fila mt' }, h('button', { class: 'btn', onclick: () => guardar(['textos']) }, '💾 Guardar textos'))));
  // Respaldo
  cont.appendChild(h('div', { class: 'tarjeta' }, h('h3', null, 'Respaldo'), h('p', { class: 'peq suave' }, 'Copia los archivos de datos (lotes, bienes, usuarios, catálogo, bitácora) a la carpeta data/respaldos del servidor. Las fotos están en data/fotos.'),
    h('button', { class: 'btn sec', onclick: async () => { try { const r = await api('POST', '/api/respaldo'); toast('Respaldo creado en ' + r.carpeta, 'ok'); } catch (e) { toast(e.message, 'error'); } } }, '💾 Crear respaldo ahora')));
  return cont;
}

// ============================================================ arranque
render();
