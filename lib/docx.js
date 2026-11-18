'use strict';
// Generación de los documentos Word (Oficio, Acta, Avalúo) sobre las plantillas institucionales.
// Estrategia: se toma el .docx original (con su membrete en el encabezado) y se reemplaza word/document.xml.
const fs = require('fs');
const path = require('path');
const zip = require('./minizip');
const N = require('./numeros');
const TEXTOS = require('./textos');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Constructores XML ----------
function rPr(o = {}) {
  let x = `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>`;
  if (o.b) x += '<w:b/><w:bCs/>';
  if (o.i) x += '<w:i/><w:iCs/>';
  if (o.caps) x += '<w:caps/>';
  if (o.color) x += `<w:color w:val="${o.color}"/>`;
  if (o.sz) x += `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`;
  return `<w:rPr>${x}</w:rPr>`;
}
function run(text, o = {}) {
  const partes = String(text == null ? '' : text).split('\n');
  return partes.map((t, i) => `<w:r>${rPr(o)}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
}
function pPr(o = {}) {
  let x = '';
  if (o.style) x += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) x += '<w:keepNext/>';
  if (o.pageBreakBefore) x += '<w:pageBreakBefore/>';
  if (o.numId != null) x += `<w:numPr><w:ilvl w:val="${o.ilvl || 0}"/><w:numId w:val="${o.numId}"/></w:numPr>`;
  if (o.before != null || o.after != null || o.line != null) {
    x += `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ''}${o.after != null ? ` w:after="${o.after}"` : ''}${o.line != null ? ` w:line="${o.line}" w:lineRule="${o.lineRule || 'auto'}"` : ''}/>`;
  }
  if (o.ind) x += `<w:ind${o.ind.left != null ? ` w:left="${o.ind.left}"` : ''}${o.ind.right != null ? ` w:right="${o.ind.right}"` : ''}${o.ind.hanging != null ? ` w:hanging="${o.ind.hanging}"` : ''}${o.ind.firstLine != null ? ` w:firstLine="${o.ind.firstLine}"` : ''}/>`;
  if (o.jc) x += `<w:jc w:val="${o.jc}"/>`;
  x += rPr(o.r || {});
  return `<w:pPr>${x}</w:pPr>`;
}
/** Párrafo. runs: string (texto plano con opciones o.r) o XML de runs ya construido. */
function p(runs, o = {}) {
  const contenido = Array.isArray(runs) ? runs.join('') : (typeof runs === 'string' && !runs.startsWith('<w:r>') ? run(runs, o.r || {}) : runs || '');
  return `<w:p>${pPr(o)}${contenido}</w:p>`;
}
const vacio = (o = {}) => p('', o);

function tcPr(o = {}) {
  let x = `<w:tcW w:w="${o.w || 0}" w:type="${o.type || 'dxa'}"/>`;
  if (o.gridSpan) x += `<w:gridSpan w:val="${o.gridSpan}"/>`;
  if (o.borders === false) x += '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>';
  if (o.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`;
  if (o.noWrap) x += '<w:noWrap/>';
  x += `<w:vAlign w:val="${o.vAlign || 'center'}"/>`;
  return `<w:tcPr>${x}</w:tcPr>`;
}
/** Celda: contenido = XML de párrafos. */
function tc(contenido, o = {}) { return `<w:tc>${tcPr(o)}${contenido || vacio()}</w:tc>`; }
function tr(celdas, o = {}) {
  let pr = '';
  if (o.cantSplit) pr += '<w:cantSplit/>';
  if (o.height) pr += `<w:trHeight w:val="${o.height}"${o.heightRule ? ` w:hRule="${o.heightRule}"` : ''}/>`;
  if (o.header) pr += '<w:tblHeader/>';
  if (o.jc) pr += `<w:jc w:val="${o.jc}"/>`;
  return `<w:tr>${pr ? `<w:trPr>${pr}</w:trPr>` : ''}${celdas.join('')}</w:tr>`;
}
function tbl(filas, o = {}) {
  const grid = (o.grid || []).map(w => `<w:gridCol w:w="${w}"/>`).join('');
  let pr = `<w:tblW w:w="${o.w != null ? o.w : 0}" w:type="${o.type || 'auto'}"/>`;
  if (o.jc) pr += `<w:jc w:val="${o.jc}"/>`;
  if (o.ind != null) pr += `<w:tblInd w:w="${o.ind}" w:type="dxa"/>`;
  if (o.borders !== false) pr += '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>';
  else pr += '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
  if (o.layout) pr += `<w:tblLayout w:type="${o.layout}"/>`;
  pr += '<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar>';
  pr += '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
  return `<w:tbl><w:tblPr>${pr}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${filas.join('')}</w:tbl>`;
}

const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14"';

function documento(bodyXml, sectPr) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${bodyXml}${sectPr}</w:body></w:document>`;
}

function empaquetar(plantilla, documentXml) {
  const base = fs.readFileSync(path.join(__dirname, '..', 'plantillas', plantilla));
  const entradas = zip.leer(base);
  entradas.set('word/document.xml', Buffer.from(documentXml, 'utf8'));
  // Quitar comentarios/personas si existieran (no se referencian desde el nuevo documento)
  return zip.escribir(entradas);
}

// ---------- Plantillas de texto ----------
function rellenar(texto, vars) {
  return String(texto == null ? '' : texto).replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}
function textos(config) {
  const t = JSON.parse(JSON.stringify(TEXTOS));
  const c = (config && config.textos) || {};
  for (const sec of Object.keys(t)) if (c[sec]) Object.assign(t[sec], c[sec]);
  return t;
}

// ---------- Preparación de datos del lote ----------
/**
 * Ordena y numera los bienes del lote.
 * Devuelve { inv:[...], bni:[...], nr:[{nombre, cantidad, clas}], porClase:[...], totales }
 */
function preparar(lote, items, config) {
  const clases = (config.clasificaciones || []);
  const orden = new Map(clases.map((c, i) => [c.clave, i]));
  const nombreClase = k => { const c = clases.find(x => x.clave === k); return c ? c.nombre : (k || 'Otro'); };
  const tipoClase = k => { const c = clases.find(x => x.clave === k); return c ? (c.tipo || c.nombre.toUpperCase()) : (k || 'OTRO'); };
  const valorClase = k => { const v = lote.valores && lote.valores[k]; if (v != null && v !== '') return Number(v); const c = clases.find(x => x.clave === k); return c ? Number(c.valor || 0) : 0; };
  const activos = items.filter(i => i.loteId === lote.id && !i.excluido);
  const ordenar = (a, b) => (orden.get(a.clas) ?? 999) - (orden.get(b.clas) ?? 999) || String(a.fechaCaptura || '').localeCompare(String(b.fechaCaptura || ''));
  const inv = activos.filter(i => i.tipoItem === 'INV').sort(ordenar).map((it, i) => ({ ...it, num: i + 1 }));
  const bni = activos.filter(i => i.tipoItem === 'BNI').sort(ordenar).map((it, i) => ({ ...it, num: i + 1 }));
  // No registrados: agrupar por clasificación + nombre
  const nrMap = new Map();
  for (const it of activos.filter(i => i.tipoItem === 'NR')) {
    const k = `${it.clas}|${(it.nombre || '').toUpperCase().trim()}`;
    const e = nrMap.get(k) || { nombre: (it.nombre || '').toUpperCase().trim(), clas: it.clas, cantidad: 0, estado: it.estado || 'Desuso', ids: [] };
    e.cantidad += Number(it.cantidad || 1); e.ids.push(it.id);
    nrMap.set(k, e);
  }
  const nr = [...nrMap.values()].sort((a, b) => (orden.get(a.clas) ?? 999) - (orden.get(b.clas) ?? 999)).map((e, i) => ({ ...e, num: i + 1 }));
  const nNR = nr.reduce((s, e) => s + e.cantidad, 0);
  // Avalúo por clase
  const porClaseMap = new Map();
  const add = (clas, cantidad, numeral, marca) => {
    const e = porClaseMap.get(clas) || { clas, tipo: tipoClase(clas), nombre: nombreClase(clas), cantidad: 0, numerales: [], marcas: new Set(), valor: valorClase(clas) };
    e.cantidad += cantidad; if (numeral != null) e.numerales.push(numeral); if (marca) e.marcas.add(marca);
    porClaseMap.set(clas, e);
  };
  for (const it of inv) add(it.clas, 1, it.num);
  for (const it of bni) add(it.clas, 1, null, 'BNI');
  for (const e of nr) add(e.clas, e.cantidad, null, 'N/R');
  const porClase = [...porClaseMap.values()].sort((a, b) => (orden.get(a.clas) ?? 999) - (orden.get(b.clas) ?? 999)).map((e, i) => {
    const partes = [];
    if (e.numerales.length) partes.push(N.rangoNumerales(e.numerales));
    for (const m of e.marcas) partes.push(m);
    return { ...e, marcas: [...e.marcas], num: i + 1, numeral: partes.join(' ~ ') || '—', total: Math.round(e.cantidad * e.valor * 100) / 100 };
  });
  const total = Math.round(porClase.reduce((s, e) => s + e.total, 0) * 100) / 100;
  return { inv, bni, nr, porClase, totales: { inv: inv.length, bni: bni.length, nr: nNR, noInventariados: bni.length + nNR, total: inv.length + bni.length + nNR, importe: total } };
}

function nombreCompleto(per) { return [per.titulo, per.nombre].filter(Boolean).join(' ').trim(); }

function listaPersonas(lista, conGafete) {
  // "Juan Pérez, Jefe del Departamento, Pedro López, Auxiliar; ... con número: X y Y respectivamente"
  if (!lista || !lista.length) return '';
  const nombres = lista.map(a => `${a.nombre}${a.cargo ? ', ' + a.cargo : ''}`).join(', ');
  return nombres;
}
function listaGafetes(lista) {
  const g = (lista || []).map(a => a.gafete).filter(Boolean);
  if (!g.length) return '';
  if (g.length === 1) return g[0];
  return g.slice(0, -1).join(', ') + ' y ' + g[g.length - 1];
}

function variables(lote, prep, config) {
  const t = prep.totales;
  const acta = lote.acta || {}, of = lote.oficio || {}, av = lote.avaluo || {};
  const inst = config.institucion || {};
  const asis = acta.asistentes || [], aud = acta.auditores || [];
  const asistentesSAF = asis.length
    ? `${listaPersonas(asis)}; adscritos ${asis.length > 1 ? 'al' : 'al'} ${acta.adscripcionAsistentes || 'Departamento de Soporte Técnico y Telecomunicaciones'}, y quienes se identifican con gafete oficial expedido por el Secretario de Administración y Finanzas del Poder Legislativo, con número: ${listaGafetes(asis)}${asis.length > 1 ? ' respectivamente' : ''}, los cuales se ponen a la vista`
    : '';
  const auditores = aud.length
    ? `${listaPersonas(aud)}${aud.length > 1 ? ', auditores' : ''} adscritos ${acta.adscripcionAuditores || 'al Departamento de Seguimiento y Evaluación y a la Dirección de Auditoría Interna'}, identificándose con gafete oficial expedido por el Secretario de Administración y Finanzas del Poder Legislativo, número: ${listaGafetes(aud)}${aud.length > 1 ? ', respectivamente' : ''}`
    : '';
  const perito = lote.perito || lote.firmante || {};
  return {
    N: String(t.total), N_LETRA: N.numeroALetras(t.total), N_INV: String(t.inv), N_INV_LETRA: N.numeroALetras(t.inv),
    N_NR: String(t.noInventariados), N_NR_LETRA: N.numeroALetras(t.noInventariados), N_BNI: String(t.bni), N_SR: String(t.nr),
    LOTE: lote.nombre || '', ORDINAL: N.ordinalFemenino(lote.numero || 1), ANIO: String(lote.anio || new Date().getFullYear()),
    FECHA_OFICIO: N.fechaCorta(of.fecha), NUM_OFICIO: of.numero || '',
    FECHA_ACTA_LETRA: N.fechaEnLetras(acta.fecha, 'del'), HORA_INICIO_LETRA: N.horaEnLetras(acta.horaInicio),
    HORA_FIN_LETRA: acta.horaFin ? N.horaEnLetras(acta.horaFin) : '----- horas con ------------- minutos',
    LUGAR_ACTA: acta.lugar || '', LUGAR_AVALUO: av.lugar || acta.lugar || '',
    ASISTENTES_SAF: asistentesSAF, AUDITORES: auditores,
    OFICIO_SOLICITUD: acta.oficioSolicitud || '', FECHA_OFICIO_SOLICITUD_LETRA: N.fechaEnLetras(acta.fechaOficioSolicitud),
    SOLICITANTE: acta.solicitante || 'el Secretario de Administración y Finanzas',
    N_INSPECCION_LETRA: acta.nBienesInspeccion ? N.numeroALetras(acta.nBienesInspeccion) : N.numeroALetras(t.total),
    FECHA_INSPECCION_LETRA: N.fechaEnLetras(acta.fechaInspeccion || acta.fecha), HORA_INSPECCION_LETRA: N.horaEnLetras(acta.horaInspeccion || acta.horaInicio),
    PERITO: nombreCompleto(perito), PERITO_CARGO: perito.cargoLargo || perito.cargo || '',
    OFICIO_DESIGNACION: acta.oficioDesignacion || '', FECHA_DESIGNACION_LETRA: N.fechaEnLetras(acta.fechaDesignacion),
    DESIGNADO_POR: acta.designadoPor || '', DESIGNADO_POR_CARGO: acta.designadoPorCargo || '',
    TOTAL: N.formatoMoneda(t.importe), TOTAL_LETRA: N.importeALetras(t.importe),
    FOJAS: String(av.fojas || ''), FOJAS_LETRA: av.fojas ? N.numeroALetras(av.fojas) : '',
    DIRECTOR: nombreCompleto(lote.firmante || {}), DIRECTOR_CARGO: (lote.firmante || {}).cargo || '',
    INSTITUCION: inst.nombre || 'Poder Legislativo del Estado de México',
  };
}

// ---------- Tablas comunes ----------
const HDR_INV = ['Núm.', 'Inventario', 'Tipo', 'Marca', 'Modelo', 'Serie', 'Estado', 'Registro', 'Clasificación general'];

function tablaInventariables(prep, cfg) {
  const { grid, sz, line, header, cellStyle } = cfg; // cellStyle: 'acta' | 'oficio'
  const nombreClase = cfg.nombreClase;
  const pc = (txt, o = {}) => p(txt, { jc: 'center', after: 0, line: line || 240, r: { sz, b: o.b } });
  const filas = [];
  filas.push(tr(HDR_INV.map((h, i) => tc(pc(h, { b: true }), { w: grid[i], shd: 'BFBFBF' })), { header: true, cantSplit: true, jc: 'center', height: 72 }));
  for (const it of prep.inv) {
    const vals = [String(it.num), it.inv || '', it.nombre || '', it.marca || '', it.modelo || '', it.serie || '', it.estado || 'Desuso', it.registro || '', nombreClase(it.clas)];
    filas.push(tr(vals.map((v, i) => tc(pc(v), { w: grid[i] })), { cantSplit: true, jc: 'center', height: 72 }));
  }
  return tbl(filas, { w: grid.reduce((a, b) => a + b, 0), type: 'dxa', jc: 'center', grid, layout: 'fixed', ind: cfg.ind });
}

function tablaBNI(prep, sz) {
  const grid = [713, 1235, 2240, 1902, 1417];
  const pc = (txt, b) => p(txt, { jc: 'center', before: 60, after: 60, line: 240, r: { sz, b } });
  const filas = [tr(['Núm.', 'Núm. BNI', 'Nombre del bien', 'Descripción', 'Estado'].map((h, i) => tc(pc(h, true), { w: grid[i], shd: 'D9D9D9' })), { header: true, cantSplit: true, jc: 'center' })];
  for (const it of prep.bni) {
    const vals = [String(it.num), it.bni || '', it.nombre || '', it.descripcion || it.nombre || '', it.estado || 'Desuso'];
    filas.push(tr(vals.map((v, i) => tc(pc(v), { w: grid[i] })), { cantSplit: true, jc: 'center' }));
  }
  if (!prep.bni.length) filas.push(tr([tc(pc('Sin bienes con etiqueta BNI'), { w: grid.reduce((a, b) => a + b, 0), gridSpan: 5 })], { jc: 'center' }));
  return tbl(filas, { w: grid.reduce((a, b) => a + b, 0), type: 'dxa', jc: 'center', grid, layout: 'fixed' });
}

function tablaNR(prep, sz) {
  const grid = [975, 1248, 2025, 3943];
  const pc = (txt, b, jc) => p(txt, { jc: jc || 'center', before: 60, after: 60, line: 240, r: { sz, b } });
  const filas = [tr(['Núm.', 'Cantidad', 'Nombre del bien', 'Estado'].map((h, i) => tc(pc(h, true), { w: grid[i], shd: 'D9D9D9', vAlign: 'bottom' })), { header: true, cantSplit: true, jc: 'center' })];
  for (const e of prep.nr) {
    const vals = [String(e.num), String(e.cantidad).padStart(2, '0'), e.nombre, e.estado || 'Desuso'];
    filas.push(tr(vals.map((v, i) => tc(pc(v), { w: grid[i] })), { cantSplit: true, jc: 'center' }));
  }
  if (!prep.nr.length) filas.push(tr([tc(pc('Sin bienes no registrados'), { w: grid.reduce((a, b) => a + b, 0), gridSpan: 4 })], { jc: 'center' }));
  filas.push(tr([tc(pc('TOTAL', true), { w: grid[0], vAlign: 'bottom' }), tc(pc(String(prep.totales.nr), true), { w: grid[1], vAlign: 'bottom' }), tc(vacio(), { w: grid[2] + grid[3], gridSpan: 2 })], { cantSplit: true, jc: 'center' }));
  return tbl(filas, { w: grid.reduce((a, b) => a + b, 0), type: 'dxa', jc: 'center', grid, layout: 'fixed' });
}

function tablaAvaluo(prep, t) {
  const grid = [683, 1580, 1276, 1276, 1417, 1134];
  const sz = 16;
  const pc = (txt, b, jc) => p(txt, { jc: jc || 'center', before: 60, after: 60, line: 240, r: { sz, b, color: '000000' } });
  const filas = [];
  filas.push(tr([tc(pc(t.encabezadoTablaAvaluo, true), { w: grid.reduce((a, b) => a + b, 0), gridSpan: 6, shd: 'BFBFBF', vAlign: 'bottom' })], { header: true, jc: 'center' }));
  filas.push(tr(['Núm.', 'Tipo de bien', 'Numeral', 'Cantidad', 'Valor unitario', 'Costo total'].map((h, i) => tc(pc(h, true), { w: grid[i], shd: 'D9D9D9', vAlign: 'bottom' })), { header: true, jc: 'center' }));
  for (const e of prep.porClase) {
    filas.push(tr([
      tc(pc(String(e.num)), { w: grid[0] }), tc(pc(e.tipo, false, 'left'), { w: grid[1] }), tc(pc(e.numeral), { w: grid[2] }),
      tc(pc(String(e.cantidad)), { w: grid[3] }), tc(pc(N.formatoMoneda(e.valor), false, 'right'), { w: grid[4] }), tc(pc(N.formatoMoneda(e.total), false, 'right'), { w: grid[5] }),
    ], { jc: 'center' }));
  }
  filas.push(tr([
    tc(pc('TOTAL', true, 'left'), { w: grid[0] + grid[1], gridSpan: 2, vAlign: 'bottom' }),
    tc(pc(String(prep.totales.total), true), { w: grid[2] + grid[3], gridSpan: 2, vAlign: 'bottom' }),
    tc(vacio(), { w: grid[4], vAlign: 'bottom' }),
    tc(pc(N.formatoMoneda(prep.totales.importe), true, 'right'), { w: grid[5], vAlign: 'bottom' }),
  ], { jc: 'center' }));
  return tbl(filas, { w: grid.reduce((a, b) => a + b, 0), type: 'dxa', jc: 'center', grid, layout: 'fixed' });
}

function bloqueFirma(persona, o = {}) {
  const sz = o.sz;
  return [p('', { jc: 'center', after: 0, line: 240 }), p('', { jc: 'center', after: 0, line: 240 }), p('', { jc: 'center', after: 0, line: 240 }),
    p(nombreCompleto(persona).toUpperCase(), { jc: 'center', after: 0, line: 240, r: { b: true, sz, color: '222222' } }),
    p((persona.cargo || '').toUpperCase(), { jc: 'center', after: 0, line: 240, r: { b: true, sz, color: '222222' } })].join('');
}

// ---------- OFICIO ----------
function generarOficio(lote, items, config) {
  const t = textos(config);
  const prep = preparar(lote, items, config);
  const v = variables(lote, prep, config);
  const of = lote.oficio || {};
  const nombreClase = k => { const c = (config.clasificaciones || []).find(x => x.clave === k); return c ? c.nombre : k; };
  const body = [];
  body.push(p(`Toluca, Estado de México; ${v.FECHA_OFICIO}`, { jc: 'right', after: 0, line: 240, r: { color: '222222' } }));
  body.push(p(`Oficio núm. ${of.numero || ''}`, { jc: 'right', after: 0, line: 240 }));
  body.push(vacio({ after: 0, line: 240 }), vacio({ after: 0, line: 240 }));
  for (const l of [of.destinatarioTitulo, of.destinatario, of.destinatarioCargo, 'PRESENTE']) if (l) body.push(p(String(l).toUpperCase(), { jc: 'both', after: 0, line: 240, r: { b: true, color: '222222' } }));
  body.push(vacio({ after: 0, line: 360 }));
  for (const k of ['parrafo1', 'parrafo2', 'parrafo3']) body.push(p(rellenar(t.oficio[k], v), { jc: 'both', before: 120, after: 120, line: 360, r: { color: '222222' } }));
  body.push(p(rellenar(t.comunes.tituloInventariables, v), { before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaInventariables(prep, { grid: [704, 992, 993, 1275, 1134, 1418, 850, 1134, 1134], sz: 16, line: 240, nombreClase }));
  body.push(p(rellenar(t.comunes.tituloBNI, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaBNI(prep, 16));
  body.push(p(rellenar(t.comunes.tituloNR, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaNR(prep, 16));
  body.push(vacio({ before: 120, after: 120, line: 360 }));
  body.push(p(rellenar(t.oficio.cierre, v), { jc: 'both', before: 120, after: 120, line: 240 }));
  body.push(vacio({ before: 120, after: 120, line: 240 }));
  body.push(p(rellenar(t.oficio.despedida, v), { jc: 'both', before: 120, after: 120, line: 240, r: { color: '222222' } }));
  body.push(vacio({ after: 0, line: 360 }));
  body.push(p(t.comunes.atentamente, { jc: 'center', after: 0, line: 360, r: { b: true } }));
  body.push(bloqueFirma(lote.firmante || {}));
  for (let i = 0; i < 4; i++) body.push(vacio({ after: 0, line: 253, lineRule: 'atLeast', jc: 'right' }));
  const ccp = of.ccp || [];
  ccp.forEach((c, i) => body.push(p((i === 0 ? 'c.c.p. ' : '') + c, { jc: 'both', after: 0, line: 240, ind: i === 0 ? undefined : { firstLine: 708 }, r: { b: i === 0, sz: 14 } })));
  if (of.iniciales) body.push(p(of.iniciales, { jc: 'both', after: 0, line: 240, ind: { firstLine: 708 }, r: { b: true, sz: 14 } }));
  const sectPr = '<w:sectPr><w:headerReference w:type="default" r:id="rId7"/><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="2694" w:right="1325" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  return empaquetar('base_oficio.docx', documento(body.join(''), sectPr));
}

// ---------- ACTA ----------
function tablaFirmas(personas, o = {}) {
  const grid = [4504, 464, 3827];
  const filas = [];
  if (o.espaciadora) filas.push(tr([tc(vacio({ after: 0, line: 240, jc: 'center' }), { w: 8795, gridSpan: 3, borders: false })], { height: 724, jc: 'center' }));
  for (let i = 0; i < personas.length; i += 2) {
    const celda = per => per ? p(per.nombre || '', { after: 0, line: 240, jc: 'center', r: { b: true } }) + p(per.cargo || '', { after: 0, line: 240, jc: 'center', r: { b: true } }) : vacio();
    filas.push(tr([tc(celda(personas[i]), { w: grid[0], borders: false }), tc(vacio({ after: 0, line: 240 }), { w: grid[1], borders: false }), tc(celda(personas[i + 1]), { w: grid[2], borders: false })], { height: 692, jc: 'center' }));
    if (i + 2 < personas.length) filas.push(tr([tc(vacio(), { w: 8795, gridSpan: 3, borders: false })], { height: 900, jc: 'center' }));
  }
  if (!filas.length) filas.push(tr([tc(vacio(), { w: 8795, gridSpan: 3, borders: false })], { jc: 'center' }));
  return tbl(filas, { w: 8795, type: 'dxa', jc: 'center', grid, borders: false });
}

function generarActa(lote, items, config) {
  const t = textos(config);
  const prep = preparar(lote, items, config);
  const v = variables(lote, prep, config);
  const acta = lote.acta || {};
  const nombreClase = k => { const c = (config.clasificaciones || []).find(x => x.clave === k); return c ? c.nombre : k; };
  const body = [];
  body.push(p(t.acta.titulo, { jc: 'center', r: { b: true } }));
  body.push(p(rellenar(t.acta.apertura, v), { jc: 'both', after: 0, keepNext: true, r: { color: '000000' } }));
  body.push(vacio({ after: 0, jc: 'both' }));
  body.push(p(rellenar(t.acta.proposito, v), { jc: 'both', after: 0, r: { color: '000000' } }));
  body.push(vacio({ after: 0, jc: 'both' }));
  body.push(p(t.acta.hechos, { r: { b: true, color: '000000' } }));
  body.push(p(rellenar(t.acta.hecho1, v), { style: 'Prrafodelista', numId: 19, jc: 'both', ind: { left: 142, hanging: 142 }, r: { color: '000000' } }));
  body.push(p(rellenar(t.acta.hecho2, v), { style: 'Prrafodelista', numId: 19, jc: 'both', after: 0, ind: { left: 142, hanging: 142 }, r: { color: '000000' } }));
  body.push(vacio({ jc: 'center', before: 120, after: 120, line: 240 }));
  body.push(p(rellenar(t.acta.tituloRelacion, v), { jc: 'center', before: 120, after: 120, line: 240, r: { b: true } }));
  body.push(p(rellenar(t.acta.tituloRelacion2, v), { jc: 'center', before: 120, after: 120, line: 240, r: { b: true } }));
  body.push(vacio({ jc: 'center', before: 120, after: 120, line: 240 }));
  body.push(p(rellenar(t.comunes.tituloInventariables, v), { before: 120, after: 120, line: 240, r: { b: true } }));
  body.push(tablaInventariables(prep, { grid: [600, 950, 1900, 1150, 1100, 1500, 900, 1150, 1460], sz: 16, line: 240, nombreClase, ind: -815 }));
  body.push(vacio({ jc: 'both', before: 120, after: 120, line: 240 }));
  body.push(p(rellenar(t.comunes.tituloBNI, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaBNI(prep, 16));
  body.push(vacio({ jc: 'both', before: 120, after: 120, line: 360 }));
  body.push(p(rellenar(t.comunes.tituloNR, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaNR(prep, 16));
  body.push(vacio());
  body.push(p(rellenar(t.acta.cierre, v), { jc: 'both', r: { color: '000000' } }));
  body.push(vacio({ jc: 'center', after: 0, line: 240 }), vacio({ jc: 'center', after: 0, line: 240 }));
  body.push(p(t.acta.firmasSAF1, { jc: 'center', after: 0, line: 240, r: { b: true } }));
  body.push(p(t.acta.firmasSAF2, { jc: 'center', after: 0, line: 240, r: { b: true } }));
  for (let i = 0; i < 4; i++) body.push(vacio({ jc: 'center', after: 0, line: 240 }));
  body.push(vacio({ jc: 'both' }));
  body.push(tablaFirmas(acta.asistentes || []));
  body.push(vacio({ jc: 'center', after: 0, line: 240 }), vacio({ jc: 'center', after: 0, line: 240 }));
  body.push(p(t.acta.firmasCont1, { jc: 'center', after: 0, line: 240, r: { b: true } }));
  body.push(p(t.acta.firmasCont2, { jc: 'center', after: 0, line: 240, r: { b: true } }));
  body.push(vacio({ jc: 'center', after: 0, line: 240 }));
  body.push(tablaFirmas(acta.auditores || [], { espaciadora: true }));
  body.push(p(rellenar(t.acta.hojaFirmas, v), { jc: 'both', r: { color: '000000' } }));
  const sectPr = '<w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="3261" w:right="1418" w:bottom="1276" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  return empaquetar('base_acta.docx', documento(body.join(''), sectPr));
}

// ---------- AVALÚO ----------
function generarAvaluo(lote, items, config) {
  const t = textos(config);
  const prep = preparar(lote, items, config);
  const v = variables(lote, prep, config);
  const nombreClase = k => { const c = (config.clasificaciones || []).find(x => x.clave === k); return c ? c.nombre : k; };
  const body = [];
  // Portada (sección 1, centrada verticalmente)
  for (let i = 0; i < 3; i++) body.push(vacio({ after: 0, line: 240, ind: { firstLine: 993 } }));
  body.push(p(rellenar(t.avaluo.portada1, v), { jc: 'center', r: { sz: 36 } }));
  body.push(vacio({ jc: 'center' }));
  body.push(p(rellenar(t.avaluo.portada2, v), { jc: 'center', after: 0, r: { sz: 36 } }));
  body.push(p(rellenar(t.avaluo.portada3, v), { jc: 'center', after: 0, r: { sz: 36 } }));
  body.push(p(rellenar(t.avaluo.portada4, v), { jc: 'center', after: 0, r: { sz: 36 } }));
  body.push(vacio({ jc: 'center' }));
  // Índice
  body.push(vacio({ jc: 'center', after: 360, line: 240 }));
  body.push(p(rellenar(t.avaluo.subtitulo, v), { jc: 'center', after: 360, line: 240, r: { b: true } }));
  body.push(vacio({ jc: 'center', after: 360, line: 240 }));
  for (const k of ['sec1', 'sec2', 'sec3', 'sec4', 'sec5', 'sec6']) body.push(p(rellenar(t.avaluo[k], v), { numId: 19, jc: 'both', before: 240, after: 240, line: 360, ind: { left: 714, hanging: 357 } }));
  // Fin de sección 1 (portada): sectPr dentro de un párrafo
  body.push(`<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:footerReference w:type="default" r:id="rId9"/><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="2257" w:right="1418" w:bottom="1418" w:left="1701" w:header="425" w:footer="1174" w:gutter="0"/><w:cols w:space="720"/><w:vAlign w:val="center"/></w:sectPr></w:pPr></w:p>`);
  // Cuerpo (sección 2)
  body.push(p(rellenar(t.avaluo.subtitulo, v), { jc: 'center', after: 0, line: 360, pageBreakBefore: true, r: { b: true } }));
  const h = (txt, extra = {}) => p(txt, { numId: 21, jc: 'both', before: 120, after: 0, line: 360, r: { b: true }, ...extra });
  const par = (txt, b) => p(rellenar(txt, v), { jc: 'both', before: 120, after: 0, line: 360, r: { b: !!b } });
  body.push(h(rellenar(t.avaluo.sec1, v), { before: 0 }));
  body.push(par(t.avaluo.objetivo, true));
  body.push(h(rellenar(t.avaluo.sec2, v)));
  body.push(par(t.avaluo.def1, true)); body.push(par(t.avaluo.def2, true)); body.push(par(t.avaluo.def3, true));
  body.push(par(t.avaluo.def3b)); body.push(par(t.avaluo.def3c)); body.push(par(t.avaluo.def4, true)); body.push(par(t.avaluo.def5, true));
  body.push(h(rellenar(t.avaluo.sec3, v)));
  body.push(par(t.avaluo.inspeccion));
  body.push(h(rellenar(t.avaluo.sec4, v)));
  body.push(par(t.avaluo.metodologiaIntro));
  for (const m of (t.avaluo.metodologia || [])) body.push(p(rellenar(m, v), { numId: 22, jc: 'both', after: 0, line: 360, ind: { left: 426, hanging: 284 } }));
  body.push(vacio({ jc: 'both', after: 0, line: 360, ind: { left: 714 } }));
  body.push(h(rellenar(t.avaluo.sec5, v), { ind: { left: 782 } }));
  body.push(p(rellenar(t.comunes.tituloInventariables, v), { before: 120, after: 120, line: 360, ind: { left: 62 }, r: { b: true } }));
  body.push(tablaInventariables(prep, { grid: [990, 990, 1440, 1076, 1134, 1417, 993, 1134, 1275], sz: 16, line: 360, nombreClase }));
  body.push(vacio({ jc: 'both', before: 120, after: 120, line: 240 }));
  body.push(p(rellenar(t.comunes.tituloBNI, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaBNI(prep, 16));
  body.push(vacio({ jc: 'both', before: 120, after: 120, line: 360 }));
  body.push(p(rellenar(t.comunes.tituloNR, v), { jc: 'both', before: 120, after: 120, line: 360, r: { b: true } }));
  body.push(tablaNR(prep, 16));
  for (let i = 0; i < 2; i++) body.push(vacio({ after: 160, line: 259 }));
  body.push(h(rellenar(t.avaluo.sec6, v)));
  body.push(vacio({ before: 120, after: 120, line: 360 }));
  body.push(tablaAvaluo(prep, t.avaluo));
  body.push(vacio({ before: 120, after: 120, line: 360 }));
  body.push(p(rellenar(t.avaluo.conclusion, v), { jc: 'both', after: 360, line: 360, r: { b: true } }));
  body.push(vacio({ jc: 'both', after: 360, line: 360 }));
  body.push(p(t.comunes.atentamente, { jc: 'center', after: 0, line: 240, r: { b: true } }));
  body.push(bloqueFirma(lote.perito || lote.firmante || {}));
  const sectPr = '<w:sectPr><w:headerReference w:type="default" r:id="rId10"/><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="2694" w:right="1325" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
  return empaquetar('base_avaluo.docx', documento(body.join(''), sectPr));
}

module.exports = { generarOficio, generarActa, generarAvaluo, preparar, variables, textos, rellenar };
