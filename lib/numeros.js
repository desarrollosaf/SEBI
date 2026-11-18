'use strict';
// Conversión de números, fechas y horas a letras (español, México).

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menorQueMil(n, apocope) {
  n = Math.floor(n);
  if (n === 0) return '';
  if (n === 100) return 'cien';
  let s = '';
  const c = Math.floor(n / 100), r = n % 100;
  if (c) s += CENTENAS[c];
  if (r) {
    if (s) s += ' ';
    if (r < 30) {
      let u = UNIDADES[r];
      if (apocope && r === 21) u = 'veintiún';
      if (apocope && r === 1) u = 'un';
      s += u;
    } else {
      const d = Math.floor(r / 10), u = r % 10;
      s += DECENAS[d];
      if (u) s += ' y ' + (apocope && u === 1 ? 'un' : UNIDADES[u]);
    }
  }
  return s;
}

/** Número entero a letras. apocope=true usa "un/veintiún" antes de sustantivo (ej. "veintiún bienes"). */
function numeroALetras(n, apocope) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'cero';
  const partes = [];
  const millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000;
  if (millones) partes.push(millones === 1 ? 'un millón' : menorQueMil(millones, true) + ' millones');
  if (miles) partes.push(miles === 1 ? 'mil' : menorQueMil(miles, true) + ' mil');
  if (resto) partes.push(menorQueMil(resto, apocope));
  return partes.join(' ');
}

/** Importe en pesos: "cinco mil quinientos setenta pesos 00/100 M.N." */
function importeALetras(monto) {
  const v = Math.round((Number(monto) || 0) * 100) / 100;
  const entero = Math.floor(v), cent = Math.round((v - entero) * 100);
  const letras = entero === 1 ? 'un peso' : numeroALetras(entero, true) + ' pesos';
  return `${letras} ${String(cent).padStart(2, '0')}/100 M.N.`;
}

function formatoMoneda(n) {
  return '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function parseFecha(f) {
  if (!f) return null;
  if (f instanceof Date) return f;
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const m2 = String(f).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
  const d = new Date(f);
  return isNaN(d) ? null : d;
}

/** "17 de noviembre de 2026" */
function fechaCorta(f) {
  const d = parseFecha(f);
  if (!d) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "once de mayo de dos mil veintiséis" (conector configurable: "de" o "del") */
function fechaEnLetras(f, conector) {
  const d = parseFecha(f);
  if (!d) return '';
  const dia = d.getDate() === 1 ? 'primero' : numeroALetras(d.getDate());
  return `${dia} de ${MESES[d.getMonth()]} ${conector || 'de'} ${numeroALetras(d.getFullYear())}`;
}

/** "nueve horas con treinta minutos" */
function horaEnLetras(hhmm) {
  if (!hhmm) return '';
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]), mi = Number(m[2]);
  const hs = h === 1 ? 'una hora' : numeroALetras(h) + ' horas';
  if (mi === 0) return hs + ' en punto';
  const ms = mi === 1 ? 'un minuto' : numeroALetras(mi) + ' minutos';
  return `${hs} con ${ms}`;
}

/** "2ª" → "Segunda" */
const ORDINALES_F = ['', 'Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava', 'Novena', 'Décima'];
function ordinalFemenino(n) { return ORDINALES_F[Number(n)] || `${n}ª`; }

/** "I", "II"... */
function romano(n) {
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; n = Number(n) || 0;
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

/** Rango de numerales a partir de una lista de enteros: [1,2,3,7,9,10] → "1-3, 7, 9-10" */
function rangoNumerales(nums) {
  const a = [...new Set(nums.map(Number).filter(n => !isNaN(n)))].sort((x, y) => x - y);
  if (!a.length) return '';
  const partes = [];
  let ini = a[0], prev = a[0];
  for (let i = 1; i <= a.length; i++) {
    if (i < a.length && a[i] === prev + 1) { prev = a[i]; continue; }
    partes.push(ini === prev ? String(ini) : `${ini}-${prev}`);
    if (i < a.length) { ini = a[i]; prev = a[i]; }
  }
  return partes.join(', ');
}

module.exports = { numeroALetras, importeALetras, formatoMoneda, fechaCorta, fechaEnLetras, horaEnLetras, ordinalFemenino, romano, rangoNumerales, parseFecha, MESES };
