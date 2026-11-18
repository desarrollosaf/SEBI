'use strict';
// Almacenamiento en archivos JSON (sin base de datos). Escrituras atómicas.
const fs = require('fs');
const path = require('path');

class Coleccion {
  constructor(archivo, inicial) {
    this.archivo = archivo;
    this.datos = inicial;
    this.pendiente = null;
    if (fs.existsSync(archivo)) {
      try { this.datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); }
      catch (e) {
        // Intentar respaldo
        const bak = archivo + '.bak';
        if (fs.existsSync(bak)) { this.datos = JSON.parse(fs.readFileSync(bak, 'utf8')); console.warn('Recuperado desde respaldo:', bak); }
        else throw e;
      }
    } else this.guardar(true);
  }
  guardar(inmediato) {
    if (inmediato) { this._escribir(); return; }
    if (this.pendiente) return;
    this.pendiente = setTimeout(() => { this.pendiente = null; this._escribir(); }, 150);
  }
  _escribir() {
    const tmp = this.archivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.datos));
    if (fs.existsSync(this.archivo)) fs.copyFileSync(this.archivo, this.archivo + '.bak');
    fs.renameSync(tmp, this.archivo);
  }
  flush() { if (this.pendiente) { clearTimeout(this.pendiente); this.pendiente = null; this._escribir(); } }
}

function abrir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'fotos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'respaldos'), { recursive: true });
  const col = {
    usuarios: new Coleccion(path.join(dir, 'usuarios.json'), []),
    lotes: new Coleccion(path.join(dir, 'lotes.json'), []),
    items: new Coleccion(path.join(dir, 'items.json'), []),
    config: new Coleccion(path.join(dir, 'config.json'), {}),
    bitacora: new Coleccion(path.join(dir, 'bitacora.json'), []),
    bloqueos: new Coleccion(path.join(dir, 'bloqueos.json'), []),
    sesiones: new Coleccion(path.join(dir, 'sesiones.json'), {}),
    catalogoBni: new Coleccion(path.join(dir, 'catalogo_bni.json'), { fecha: null, archivo: null, bienes: [] }),
    catalogo: new Coleccion(path.join(dir, 'catalogo.json'), { fecha: null, archivo: null, bienes: [] }),
  };
  const flushAll = () => Object.values(col).forEach(c => c.flush());
  process.on('exit', flushAll);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushAll(); process.exit(0); });
  return col;
}

let contador = Date.now() % 100000;
function nuevoId(prefijo) {
  contador++;
  return `${prefijo || ''}${Date.now().toString(36)}${(contador % 46656).toString(36).padStart(3, '0')}`;
}

module.exports = { abrir, nuevoId };
