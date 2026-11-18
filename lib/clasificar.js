'use strict';
// Homologación y clasificación de bienes informáticos.

function normalizar(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[.\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clasificaciones por omisión, en el orden en que aparecen en los documentos. Valores unitarios del avalúo de mayo 2026. */
const CLASIFICACIONES_DEFAULT = [
  { clave: 'LAPTOP', nombre: 'Laptop / computadora portátil', tipo: 'LAPTOP', valor: 50, patrones: ['LAP ?TOP', 'PORTATIL', 'NOTEBOOK', 'MACBOOK'] },
  { clave: 'CPU', nombre: 'CPU / computadora', tipo: 'CPU', valor: 45, patrones: ['^C ?P ?U', 'COMPUTADORA DE ESCRITORIO', 'DESKTOP', 'WORKSTATION', 'ESTACION DE TRABAJO', 'MAC PRO', 'POWER MAC', 'MAC MINI', '^COMPUTADORA$'] },
  { clave: 'TODO_EN_UNO', nombre: 'Todo en uno', tipo: 'TODO EN UNO', valor: 45, patrones: ['TODO EN UNO', 'ALL IN ONE', 'IMAC'] },
  { clave: 'MONITOR', nombre: 'Monitor', tipo: 'MONITOR', valor: 5, patrones: ['MONITOR', '^PANTALLA'] },
  { clave: 'NO_BREAK', nombre: 'No break', tipo: 'NO BREAK', valor: 25, patrones: ['NO ?BREAK', '^UPS', 'RESPALDO DE ENERGIA'] },
  { clave: 'IMPRESORA', nombre: 'Impresora', tipo: 'IMPRESORA', valor: 35, patrones: ['IMPRESORA', 'MULTIFUNCIONAL', 'PLOTTER', 'PLOTER'] },
  { clave: 'ESCANER', nombre: 'Escáner', tipo: 'ESCANER', valor: 40, patrones: ['ESCANER', 'SCANNER', 'SCANER', 'DIGITALIZADOR'] },
  { clave: 'TABLETA', nombre: 'Tableta', tipo: 'TABLETA', valor: 25, patrones: ['TABLET', 'IPAD'] },
  { clave: 'PROYECTOR', nombre: 'Proyector', tipo: 'PROYECTOR', valor: 30, patrones: ['PROYECTOR', 'CANON', 'VIDEOPROYECTOR'] },
  { clave: 'CONVERSOR', nombre: 'Conversor', tipo: 'CONVERSOR', valor: 5, patrones: ['CONVERSOR', 'CONVERTIDOR', 'ADAPTADOR'] },
  { clave: 'LECTOR', nombre: 'Lector de tarjeta', tipo: 'LECTOR DE TARJETA', valor: 5, patrones: ['LECTOR'] },
  { clave: 'ESTABILIZADOR', nombre: 'Estabilizador de imágenes', tipo: 'ESTABILIZADOR DE IMAGENES', valor: 5, patrones: ['ESTABILIZADOR'] },
  { clave: 'JOYSTICK', nombre: 'Joystick', tipo: 'JOYSTICK', valor: 5, patrones: ['JOYSTICK', 'CONTROL DE JUEGO', 'GAMEPAD'] },
  { clave: 'CAMARA', nombre: 'Cámara', tipo: 'CAMARA', valor: 40, patrones: ['CAMARA', 'WEBCAM', 'WEB CAM', 'VIDEOCAMARA'] },
  { clave: 'DISCO_DURO', nombre: 'Disco duro', tipo: 'DISCO DURO', valor: 5, patrones: ['DISCO DURO', '^SSD', 'UNIDAD DE ESTADO SOLIDO', 'MEMORIA USB', 'USB'] },
  { clave: 'ROUTER', nombre: 'Router', tipo: 'ROUTER', valor: 20, patrones: ['ROUTER', 'RUTEADOR', 'MODEM', 'GATEWAY', 'FIREWALL'] },
  { clave: 'ACCESS_POINT', nombre: 'Access point', tipo: 'ACCESS POINT', valor: 20, patrones: ['ACCESS POINT', 'ACCES POINT', 'PUNTO DE ACCESO', '^ANTENA', 'AP '] },
  { clave: 'SWITCH', nombre: 'Switch', tipo: 'SWITCH', valor: 20, patrones: ['SWITCH', 'SWICH', 'SWTICH', 'CONMUTADOR'] },
  { clave: 'SERVIDOR', nombre: 'Servidor', tipo: 'SERVIDOR', valor: 45, patrones: ['SERVIDOR', 'SERVER', '^NAS', 'ALMACENAMIENTO'] },
  { clave: 'TELEFONO', nombre: 'Teléfono', tipo: 'TELEFONO', valor: 5, patrones: ['TELEFONO', 'CONMUTADOR TELEFONICO', 'DIADEMA', '^FAX'] },
  { clave: 'RADIO', nombre: 'Radio', tipo: 'RADIO', valor: 5, patrones: ['^RADIO', 'TRANSMISOR', 'RECEPTOR', 'WALKIE'] },
  { clave: 'REGULADOR', nombre: 'Regulador', tipo: 'REGULADOR', valor: 5, patrones: ['REGULADOR', 'SUPRESOR'] },
  { clave: 'BOCINA', nombre: 'Bocina', tipo: 'BOCINA', valor: 5, patrones: ['BOCINA', 'ALTA ?VOZ', 'ALTAVOZ', 'AUDIFONO', 'MICROFONO', 'AMPLIFICADOR'] },
  { clave: 'TECLADO', nombre: 'Teclado', tipo: 'TECLADO', valor: 5, patrones: ['TECLADO'] },
  { clave: 'MOUSE', nombre: 'Mouse', tipo: 'MOUSE', valor: 5, patrones: ['MOUSE', 'RATON'] },
  { clave: 'CABLE', nombre: 'Cable', tipo: 'CABLE', valor: 1, patrones: ['CABLE', 'EXTENSION', 'PATCH ?CORD', 'HDMI', 'VGA', 'UTP'] },
  { clave: 'CARGADOR', nombre: 'Cargador', tipo: 'CARGADOR', valor: 5, patrones: ['CARGADOR', 'ELIMINADOR', 'ADAPTADOR DE CORRIENTE', 'FUENTE DE PODER', 'FUENTE DE ALIMENTACION'] },
  { clave: 'REFACCION', nombre: 'Pieza / refacción', tipo: 'PIEZA / REFACCIÓN', valor: 2, patrones: ['REFACCION', 'PIEZA', 'MEMORIA RAM', 'TARJETA', 'VENTILADOR', 'BATERIA', 'TONER', 'CARTUCHO', 'MULTICONTACTO'] },
  { clave: 'GABINETE', nombre: 'Gabinete / rack', tipo: 'GABINETE', valor: 5, patrones: ['GABINETE', '^RACK', 'CHAROLA'] },
  { clave: 'OTRO', nombre: 'Otro', tipo: 'OTRO', valor: 5, patrones: [] },
];

function compilar(clasificaciones) {
  return (clasificaciones || CLASIFICACIONES_DEFAULT).map(c => ({
    ...c,
    re: (c.patrones || []).map(p => { try { return new RegExp(p, 'i'); } catch (e) { return null; } }).filter(Boolean),
  }));
}

/** Devuelve la clave de clasificación para un nombre de bien. */
function clasificar(nombreBien, clasificaciones) {
  const n = normalizar(nombreBien);
  const lista = compilar(clasificaciones);
  // "TECLADO Y MOUSE" se clasifica como teclado (primer patrón que coincide en orden de lista, pero teclado/mouse van al final; priorizamos coincidencia más larga)
  let mejor = null, mejorLen = 0;
  for (const c of lista) {
    for (const re of c.re) {
      const m = n.match(re);
      if (m && m[0].length > mejorLen) { mejor = c; mejorLen = m[0].length; }
    }
  }
  return mejor ? mejor.clave : 'OTRO';
}

const MARCAS = [
  [/^(H ?P|HEWLETT( PACKARD)?|HEWLET PACKARD|HEWLET)$/, 'HP'],
  [/^(TRIPP? ?LITE|TRIP LITE|TRIPPE LITE)$/, 'TRIPP LITE'],
  [/^(KINGSTONE?)$/, 'KINGSTON'],
  [/^(UBIQUI(TI)?|UBIQUITY)$/, 'UBIQUITI'],
  [/^(INTELL?INET|INTELLNET)$/, 'INTELLINET'],
  [/^(BLACKMAGIC( DESING| DESIGN)?)$/, 'BLACKMAGIC DESIGN'],
  [/^(APPLE( IMAC)?|MAC|IMAC)$/, 'APPLE'],
  [/^(SIN MARCA|S M|N A|NA|NINGUNA|)$/, 'SIN MARCA'],
];

function homologarMarca(marca) {
  const n = normalizar(marca);
  for (const [re, v] of MARCAS) if (re.test(n)) return v;
  return n;
}

/** Indica si un número de serie es "sin serie". */
function sinSerie(serie) {
  const n = normalizar(serie);
  return !n || /^(SIN|S ?N|N ?A|NO TIENE|ILEGIBLE|NINGUN[OA]|0+)$/.test(n) || /SIN (NUMERO|NO|NUM)/.test(n) || n === 'SIN SERIE' || n === 'S N';
}

function normalizarSerie(serie) { return normalizar(serie).replace(/\s+/g, ''); }

module.exports = { normalizar, CLASIFICACIONES_DEFAULT, clasificar, homologarMarca, sinSerie, normalizarSerie };
