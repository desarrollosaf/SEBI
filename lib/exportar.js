'use strict';
// Exportación a Excel de la relación de bienes del lote.
const XLSX = require('./xlsx.full.min.js');
const { preparar } = require('./docx');
const N = require('./numeros');

function hoja(datos, anchos) {
  const ws = XLSX.utils.json_to_sheet(datos);
  if (anchos) ws['!cols'] = anchos.map(w => ({ wch: w }));
  return ws;
}

function exportarLote(lote, items, config) {
  const prep = preparar(lote, items, config);
  const nombreClase = k => { const c = (config.clasificaciones || []).find(x => x.clave === k); return c ? c.nombre : k; };
  const wb = XLSX.utils.book_new();
  const inv = prep.inv.map(it => ({
    'Núm.': it.num, 'Inventario': it.inv, 'Tipo': it.nombre, 'Marca': it.marca, 'Modelo': it.modelo, 'Serie': it.serie,
    'Estado': it.estado, 'Registro': it.registro, 'Clasificación general': nombreClase(it.clas),
    'Valor avalúo': (prep.porClase.find(c => c.clas === it.clas) || {}).valor || 0,
    'Condición en sistema': (it.catalogo || {}).cond || '', 'Resguardante en sistema': (it.catalogo || {}).resg || '',
    'Adscripción': (it.catalogo || {}).ads || '', 'Partida': (it.catalogo || {}).partidaDesc || '', 'Valor real': (it.catalogo || {}).valor || '',
    'Fecha registro': (it.catalogo || {}).freg || '', 'Ubicación': it.ubicacion || '', 'Observaciones': it.observaciones || '',
    'Fotos': (it.fotos || []).length, 'Capturó': it.capturadoPor || '', 'Fecha captura': it.fechaCaptura || '', 'Verificado': it.verificado ? 'Sí' : 'No', 'Verificó': it.verificadoPor || '',
  }));
  XLSX.utils.book_append_sheet(wb, hoja(inv, [6, 11, 26, 14, 16, 20, 10, 14, 26, 10, 22, 26, 30, 22, 10, 12, 14, 30, 6, 14, 20]), 'Inventariables');
  const bni = prep.bni.map(it => ({ 'Núm.': it.num, 'Núm. BNI': it.bni, 'Nombre del bien': it.nombre, 'Descripción': it.descripcion || it.nombre, 'Marca': it.marca || '', 'Modelo': it.modelo || '', 'Serie': it.serie || '', 'Estado': it.estado, 'Clasificación general': nombreClase(it.clas), 'Ubicación': it.ubicacion || '', 'Observaciones': it.observaciones || '', 'Capturó': it.capturadoPor || '', 'Fecha captura': it.fechaCaptura || '' }));
  XLSX.utils.book_append_sheet(wb, hoja(bni, [6, 12, 26, 26, 14, 16, 20, 10, 26, 14, 30, 14, 20]), 'BNI');
  const nr = prep.nr.map(e => ({ 'Núm.': e.num, 'Cantidad': e.cantidad, 'Nombre del bien': e.nombre, 'Estado': e.estado, 'Clasificación general': nombreClase(e.clas) }));
  nr.push({ 'Núm.': 'TOTAL', 'Cantidad': prep.totales.nr });
  XLSX.utils.book_append_sheet(wb, hoja(nr, [8, 10, 26, 10, 26]), 'No registrados');
  const av = prep.porClase.map(e => ({ 'Núm.': e.num, 'Tipo de bien': e.tipo, 'Numeral': e.numeral, 'Cantidad': e.cantidad, 'Valor unitario': e.valor, 'Costo total': e.total }));
  av.push({ 'Núm.': 'TOTAL', 'Cantidad': prep.totales.total, 'Costo total': prep.totales.importe });
  XLSX.utils.book_append_sheet(wb, hoja(av, [8, 28, 22, 10, 14, 14]), 'Avalúo');
  const res = [
    { Concepto: 'Lote', Valor: lote.nombre },
    { Concepto: 'Bienes inventariables', Valor: prep.totales.inv },
    { Concepto: 'Bienes con etiqueta BNI', Valor: prep.totales.bni },
    { Concepto: 'Bienes no registrados', Valor: prep.totales.nr },
    { Concepto: 'Total de bienes', Valor: prep.totales.total },
    { Concepto: 'Importe del avalúo', Valor: prep.totales.importe },
    { Concepto: 'Importe en letra', Valor: N.importeALetras(prep.totales.importe) },
    { Concepto: 'Generado', Valor: new Date().toLocaleString('es-MX') },
  ];
  XLSX.utils.book_append_sheet(wb, hoja(res, [26, 60]), 'Resumen');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Exporta cualquier arreglo de objetos a xlsx (una hoja). */
function exportarTabla(nombreHoja, filas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombreHoja.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { exportarLote, exportarTabla };
