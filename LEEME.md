# SEBI · Sistema de Enajenación de Bienes Informáticos

Herramienta web para el levantamiento, clasificación, detección de duplicados y generación de documentos del proceso de enajenación de bienes informáticos de la bodega de la Dirección de Informática (Poder Legislativo del Estado de México).

Funciona en una computadora o servidor con **Node.js** (sin base de datos, sin `npm install`, sin internet). Se usa desde el navegador de las computadoras y desde el celular (cámara para escanear etiquetas y tomar fotos).

---

## 1. Instalación (5 minutos)

1. Instala **Node.js LTS** (18 o superior) desde https://nodejs.org si la máquina no lo tiene (`node -v` en una terminal lo confirma).
2. Descomprime `SEBI.zip` en una carpeta, por ejemplo `C:\SEBI` o `/opt/sebi`.
3. Ejecuta:
   - Windows: doble clic en **`iniciar.bat`** (o `node server.js` en una terminal).
   - Linux / macOS: `./iniciar.sh` (o `node server.js`).
4. La consola muestra las direcciones:
   ```
   Abre en la computadora:   http://localhost:8080
   En la red (computadoras): http://192.168.1.50:8080
   En el celular (cámara):   https://192.168.1.50:8443   (acepta el aviso del certificado)
   ```
5. Entra con el usuario inicial **`admin` / `admin`** y cambia la contraseña (botón 🔑 arriba a la derecha).

Si Windows pregunta si permite a Node.js el acceso a la red, acepta (redes privadas) para que los celulares y otras computadoras puedan conectarse. Si hay firewall, abre los puertos **8080** y **8443**.

### Celular: cámara y escáner

Los navegadores solo permiten usar la cámara en páginas **https**. Por eso SEBI publica también `https://IP:8443` con un certificado autofirmado:

1. En el celular, abre `https://<IP del servidor>:8443`.
2. El navegador avisará "La conexión no es privada": toca **Avanzado → Continuar** (Chrome) o **Mostrar detalles → Visitar sitio** (Safari). Se hace una sola vez por dispositivo.
3. Al pulsar **Escanear** o **Tomar foto** por primera vez, concede el permiso de cámara.

Opcional: en Android/iPhone, "Agregar a pantalla de inicio" deja SEBI como app.

Para usar tu propio certificado (por ejemplo de la CA interna), reemplaza `cert/servidor.crt` y `cert/servidor.key`. `generar-certificado.bat` crea uno nuevo si tienes `openssl`.

### Cambiar puertos o carpeta de datos

Variables de entorno opcionales: `SEBI_HTTP=8080`, `SEBI_HTTPS=8443`, `SEBI_DATA=C:\SEBI\data`.

---

## 2. Flujo de trabajo

1. **Catálogo** → importa el Excel del sistema de Bienes Muebles (`reporte_bienes…xlsx`) en *Bienes inventariables* y el de bienes de bajo costo (`reporte-bienes-bajo-costo…xlsx`) en *Bienes de bajo costo (BNI)*. Los BNI escaneados se consultan en ese catálogo, con las mismas alertas y bloqueos. Se detectan las columnas por encabezado (`numero_inventario`, `nombre_bien`, `marca`, `modelo`, `numero_serie`, `condicion_bien_id`, `tipo_registro`, `Servidor público`, `Adscripción`, `partida_descripcion`…). Vuelve a importarlo cuando tengas un reporte más reciente; los lotes capturados no se tocan.
2. **Inicio → Nuevo lote** (p. ej. "2ª Enajenación 2026").
3. **Captura** (desde el celular en bodega o desde la PC con webcam):
   - *Inventariable*: escanea o teclea el número (A36417). Se muestran los datos del sistema y el **semáforo de alertas**:
     - 🔴 Ya dado de baja (enajenación anterior) · Ya capturado en este lote · Misma serie que otro bien del lote.
     - 🟡 Registrado como "Funcionando" · A resguardo de otra persona (no de la bodega) · Incluido en otro lote · No existe en el catálogo.
     - 🔵 Sin número de serie · Serie distinta a la del sistema · Partida no informática · Condición "en investigación".
     Los bienes **dados de baja / ya enajenados** y los **ya capturados en el lote** muestran una pantalla roja "NO SE PUEDE REGISTRAR" y no se pueden guardar. Los de **otro resguardante** muestran un aviso naranja grande con su nombre. Al escanear se guarda automáticamente la foto del número de inventario.
   - *Etiqueta BNI*: bienes con etiqueta BNI (no inventariables).
   - *Piezas sin inventario*: cables, cargadores, teclados, mouse, cámaras de seguridad, refacciones… solo se cuentan con botones +1 / +5 (cada usuario lleva su conteo).
   - *✓ Verificación*: el día de la inspección con Contraloría, escanea cada bien para marcarlo como verificado (quién y cuándo).
   - En cada bien se guarda quién lo capturó, fecha, fotos, ubicación en bodega y observaciones. "Escaneo continuo" vuelve a abrir el escáner al guardar.
4. **Bienes del lote**: tabla con filtros (tipo, clasificación, alertas, usuario), edición, exclusión, cambio masivo de clasificación, etiquetas de los seleccionados.
5. **Análisis**: inventarios/BNI repetidos, series repetidas, posibles duplicados (mismo tipo+marca+modelo sin serie), bienes con alertas, sin foto, sin clasificar, capturas por usuario.
6. **Avalúo**: valor unitario por clasificación (precargado con los del avalúo de mayo 2026), total e importe en letra.
7. **Documentos**: datos del lote (oficio, acta, perito, asistentes, auditores, fojas…) y generación de:
   - **Oficio**, **Acta administrativa** y **Avalúo** en Word con el membrete institucional (se usan tus archivos como base).
   - **Relación en Excel** (inventariables, BNI, no registrados, avalúo, resumen).
   - **Etiquetas Avery 5163** (2" × 4", 10 por hoja carta) con QR; se puede indicar cuántas etiquetas ya se usaron de la primera hoja.
   - **Hoja de conteo** para la inspección física.
   Los números en letra ("doscientos cincuenta y tres", "cinco mil quinientos setenta pesos 00/100 M.N."), fechas y horas en letra se calculan solos.
8. **Lista de bloqueo** (administrador): pega varios números de inventario o BNI (uno por línea, separados por coma o una columna copiada de Excel) con un motivo. Al escanearlos aparece la pantalla roja y no se pueden registrar en ningún lote. Si alguno ya estaba capturado, se marca en rojo en Bienes del lote y en Análisis.
9. **Configuración** (administrador): clasificaciones, patrones de reconocimiento y valores; valores por omisión de los lotes (firmas, destinatario, lugar); **textos de los documentos** (editables, con variables como `{{N}}`, `{{N_LETRA}}`, `{{FECHA_ACTA_LETRA}}`…); respaldo.
10. **Usuarios**: cada persona con su usuario y contraseña; rol *captura* o *administrador*. **Bitácora**: registro de todos los movimientos.

Al imprimir etiquetas: escala **100 %** (tamaño real), sin "ajustar a la página".

---

## 3. Dónde quedan los datos

Todo está en la carpeta `data/`:

| Archivo / carpeta | Contenido |
|---|---|
| `catalogo.json` | Catálogo importado del sistema de Bienes Muebles |
| `lotes.json`, `items.json` | Lotes y bienes capturados |
| `usuarios.json`, `sesiones.json` | Usuarios (contraseñas con hash scrypt) y sesiones |
| `config.json` | Clasificaciones, valores, textos, plantilla de lote |
| `bitacora.json` | Bitácora |
| `fotos/` | Fotografías de los bienes |
| `respaldos/` | Respaldos creados desde Configuración |

**Respaldo**: copia la carpeta `data/` completa (o usa Configuración → Crear respaldo, que copia los JSON a `data/respaldos/`; las fotos cópialas aparte). Para mover SEBI a otro servidor basta con copiar toda la carpeta.

Los archivos `.json` se escriben de forma atómica y se conserva una copia `.bak` del estado anterior.

---

## 4. Estructura del proyecto

```
SEBI/
  server.js            Servidor HTTP/HTTPS, API y lógica (Node.js puro)
  lib/
    docx.js            Generación de Oficio, Acta y Avalúo (Word) sobre las plantillas
    textos.js          Textos por omisión de los documentos
    numeros.js         Números, importes, fechas y horas en letra
    clasificar.js      Homologación y clasificación automática de bienes
    importar.js        Importación del Excel del sistema de Bienes Muebles
    exportar.js        Exportación a Excel
    store.js           Almacenamiento en JSON
    minizip.js         Lectura/escritura ZIP (para los .docx)
    xlsx.full.min.js   SheetJS (lectura/escritura de Excel), licencia Apache-2.0
  plantillas/          base_oficio.docx, base_acta.docx, base_avaluo.docx (membrete institucional)
  public/              Interfaz web (index.html, app.js, estilos.css) y librerías del navegador
                       (html5-qrcode: escáner; qrcode.js: generador de QR)
  cert/                Certificado autofirmado para https
  data/                Datos (se crea al iniciar)
```

No requiere `npm install`: las librerías ya vienen incluidas.

---

## 5. Dejarlo corriendo como servicio (opcional)

- **Windows**: con [NSSM](https://nssm.cc) → `nssm install SEBI "C:\Program Files\nodejs\node.exe" "C:\SEBI\server.js"` (directorio de inicio `C:\SEBI`), o una tarea programada "al iniciar sesión" que ejecute `iniciar.bat`.
- **Linux** (systemd): crea `/etc/systemd/system/sebi.service` con `ExecStart=/usr/bin/node /opt/sebi/server.js`, `WorkingDirectory=/opt/sebi`, `Restart=always`; luego `systemctl enable --now sebi`.
- También funciona detrás de Apache/Nginx como proxy inverso (en ese caso el https lo da el proxy).

---

## 6. Preguntas frecuentes

- **El celular no abre la cámara**: comprueba que entraste por `https://…:8443` y aceptaste el certificado; en Chrome revisa Ajustes del sitio → Cámara.
- **"Ya está dado de baja en el sistema"**: el bien ya se enajenó en un proceso anterior según el catálogo importado; no debe volver a listarse.
- **Un bien no aparece en el catálogo**: se puede capturar igual (queda marcado como no encontrado) o reimporta un reporte más reciente.
- **Olvidé la contraseña de admin**: otro administrador puede restablecerla en Usuarios. Si no hay ninguno, borra `data/usuarios.json` con el servidor detenido: al iniciar se vuelve a crear `admin/admin` (los demás usuarios se tendrían que crear de nuevo).
- **Memoria**: la importación del catálogo completo (52 mil bienes) usa alrededor de 700 MB durante unos segundos; después el servidor consume ~200 MB.
