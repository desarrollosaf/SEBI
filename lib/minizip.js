'use strict';
// Lector/escritor ZIP mínimo (sin dependencias) para manipular archivos .docx.
const zlib = require('zlib');

const crc32 = zlib.crc32 ? (b => zlib.crc32(b) >>> 0) : (() => {
  const T = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[i] = c; }
  return b => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (~c) >>> 0; };
})();

/** Lee un zip y devuelve un Map nombre → Buffer (contenido descomprimido). */
function leer(buf) {
  // Buscar End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido (sin EOCD)');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP inválido (central dir)');
    const metodo = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const nombre = buf.toString('utf8', off + 46, off + 46 + nlen);
    // local header
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnlen + lelen;
    const datos = buf.subarray(dataStart, dataStart + csize);
    let contenido;
    if (metodo === 0) contenido = Buffer.from(datos);
    else if (metodo === 8) contenido = zlib.inflateRawSync(datos);
    else throw new Error('Método de compresión no soportado: ' + metodo);
    if (!nombre.endsWith('/')) entradas.set(nombre, contenido);
    off += 46 + nlen + elen + clen;
  }
  return entradas;
}

function dosFecha(d) {
  const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const f = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { t, f };
}

/** Escribe un zip a partir de un Map/objeto nombre → Buffer|string. */
function escribir(entradas) {
  const lista = entradas instanceof Map ? [...entradas.entries()] : Object.entries(entradas);
  const partes = [], central = [];
  let offset = 0;
  const { t, f } = dosFecha(new Date());
  for (const [nombre, valor] of lista) {
    const data = Buffer.isBuffer(valor) ? valor : Buffer.from(String(valor), 'utf8');
    const nombreB = Buffer.from(nombre, 'utf8');
    const crc = crc32(data);
    // Los primeros bytes de un docx deben ser [Content_Types].xml; usamos deflate salvo para archivos ya comprimidos.
    const almacenar = /\.(png|jpe?g|gif)$/i.test(nombre);
    const comp = almacenar ? data : zlib.deflateRawSync(data, { level: 6 });
    const metodo = almacenar ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(metodo, 8);
    lh.writeUInt16LE(t, 10); lh.writeUInt16LE(f, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nombreB.length, 26); lh.writeUInt16LE(0, 28);
    partes.push(lh, nombreB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(metodo, 10);
    ch.writeUInt16LE(t, 12); ch.writeUInt16LE(f, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nombreB.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, nombreB);
    offset += lh.length + nombreB.length + comp.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(lista.length, 8); eocd.writeUInt16LE(lista.length, 10); eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...partes, ...central, eocd]);
}

module.exports = { leer, escribir };
