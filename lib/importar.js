'use strict';
// Importación del reporte de bienes (Excel del sistema de Bienes Muebles) al catálogo local.
const XLSX = require('./xlsx.full.min.js');
const { normalizar, clasificar } = require('./clasificar');

// Encabezado del Excel → campo del catálogo (los encabezados se comparan normalizados)
const MAPA = {
  'ID': 'id', 'NUMERO INVENTARIO': 'inv', 'NUMERO DE INVENTARIO': 'inv', 'INVENTARIO': 'inv', 'NO INVENTARIO': 'inv',
  'TIEMPO VIDA': 'tvida', 'NOMBRE BIEN': 'nombre', 'NOMBRE DEL BIEN': 'nombre', 'BIEN': 'nombre', 'DESCRIPCION': 'nombre',
  'CLAVE GRUPO': 'grupo', 'FECHA REGISTRO': 'freg', 'NUMERO SERIE': 'serie', 'NO SERIE': 'serie', 'SERIE': 'serie',
  'MATERIAL': 'material', 'CARACTERISTICAS': 'carac', 'MARCA': 'marca', 'MODELO': 'modelo', 'COLOR': 'color',
  'FACTURA ID': 'facturaId', 'ANIO POLIZA': 'anioPoliza', 'NUMERO POLIZA': 'poliza', 'FECHA POLIZA': 'fpoliza',
  'CONDICION BIEN ID': 'cond', 'CONDICION': 'cond', 'CONDICION BIEN': 'cond', 'TIPO REGISTRO': 'treg',
  'RFC PROVEEDOR': 'rfcProv', 'FOLIO FISCAL': 'folioFiscal', 'VALOR REAL': 'valor', 'VALOR': 'valor', 'CUENTA': 'cuenta',
  'ENAJENACION': 'enaj', 'MOTIVO ENAJENACION': 'motivoEnaj', 'ENAJENACION ID': 'enajId', 'MOTIVO ENEAJENACION ID': 'motivoEnajId', 'MOTIVO ENAJENACION ID': 'motivoEnajId',
  'VALOR ENAJENACION': 'valorEnaj', 'OBSERVACIONES': 'obs', 'OBSERVACION BAJA': 'obsBaja', 'TIPO BIEN ID': 'tipoBien',
  'FECHA ASIGNACION': 'fasig', 'RFC': 'rfc', 'SERVIDOR PUBLICO': 'resg', 'RESGUARDANTE': 'resg', 'DIRECCION': 'dir',
  'ADSCRIPCION': 'ads', 'DEPENDENCIA': 'dep', 'ESTATUS SERVIDOR PUBLICO': 'estRes', 'POLIZA DE BAJA': 'polBaja',
  'MOTIVO BAJA': 'motivoBaja', 'FECHA POLIZA BAJA': 'fpolBaja', 'FECHA CAPTURA BAJA': 'fcapBaja',
  'PARTIDA': 'partida', 'PARTIDA DESCRIPCION': 'partidaDesc', 'CLAVE CONCEPTO': 'concepto', 'CONCEPTO DESCRIPCION': 'conceptoDesc',
};

/** Normaliza un número de inventario/BNI: mayúsculas, sin espacios ni BOM; corrige BN1xxxx / BINxxxx → BNIxxxx. */
function normInv(c) {
  let s = String(c == null ? '' : c).replace(/^\uFEFF/, '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  s = s.replace(/^BIN(?=\d)/, 'BNI').replace(/^BN1(\d{4})$/, 'BNI$1');
  return s;
}

function limpiar(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s;
}

/** Lee el Excel (Buffer) y devuelve { bienes, columnas, omitidas } */
function importarExcel(buffer, clasificaciones) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!filas.length) throw new Error('El archivo está vacío');
  // Buscar la fila de encabezados (la primera que contenga "inventario")
  let hIdx = filas.findIndex(f => (f || []).some(c => /INVENTARIO/.test(normalizar(c))));
  if (hIdx < 0) throw new Error('No se encontró la columna de número de inventario');
  const encabezados = filas[hIdx].map(h => normalizar(h));
  const campos = encabezados.map(h => MAPA[h] || null);
  const columnas = encabezados.map((h, i) => ({ encabezado: filas[hIdx][i], campo: campos[i] }));
  if (!campos.includes('inv')) throw new Error('No se identificó la columna de número de inventario');
  const bienes = [];
  let omitidas = 0;
  for (let i = hIdx + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || !f.length) continue;
    const b = {};
    for (let c = 0; c < campos.length; c++) {
      if (!campos[c]) continue;
      const v = limpiar(f[c]);
      if (v !== '') b[campos[c]] = v;
    }
    if (!b.inv) { omitidas++; continue; }
    const original = String(b.inv).replace(/^\uFEFF/, '').trim().toUpperCase();
    b.inv = normInv(original);
    if (b.inv !== original.replace(/\s+/g, '')) b.invOriginal = original;
    if (b.valor != null && b.valor !== '') { const n = Number(String(b.valor).replace(/[,$\s]/g, '')); if (!isNaN(n)) b.valor = n; }
    b.clas = clasificar(b.nombre || '', clasificaciones);
    bienes.push(b);
  }
  const bni = bienes.filter(b => /^BNI/.test(b.inv)).length;
  return { bienes, columnas, omitidas, esBNI: bienes.length > 0 && bni / bienes.length > 0.5 };
}

module.exports = { importarExcel, normInv };
