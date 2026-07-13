// Generación de los 2 PDF de MAO (guía §9/§10). Funciones puras sobre bytes:
// el server y el POC las comparten. Sin estado, sin disco.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { capturaEmplazamiento, localizacionInterna } from './catastro.mjs';

// --- Certificado de Habitabilidad (AcroForm A4, 3 páginas, 24 campos) ---
// Checkboxes: estado ON = "Sí" (verificado sobre el PDF real); pdf-lib usa el
// onValue del propio campo al hacer check(), así que no se hardcodea.
const CASILLAS = {
  renovacion: 'Casilla de verificación1',
  carencia: 'Casilla de verificación2',
  vivienda: 'Casilla de verificación3',
  local: 'Casilla de verificación4',
  edificioResidencialNoVivienda: 'Casilla de verificación5',
};

// Bloque/escalera/planta/puerta: el técnico a menudo no los manda y la cédula salía con esos
// huecos en blanco. El Catastro los tiene (Consulta_DNPRC por RC) → se rellenan solos.
// Solo se tocan los HUECOS: lo que venga del email/expediente siempre manda.
const LOCALIZACION = {
  Texto11_bloque: 'bloque',
  Texto12_escalera: 'escalera',
  Texto13_piso: 'piso',
  Texto14_puerta: 'puerta',
};

export async function fillCertificado(templateBytes, payload) {
  const cert = { ...(payload.certificadoHabitabilidad || {}) };

  if (Object.keys(LOCALIZACION).some((k) => !String(cert[k] ?? '').trim())) {
    const cat = await localizacionInterna(cert.Texto8_referenciaCatastral);
    for (const [campo, dato] of Object.entries(LOCALIZACION)) {
      if (!String(cert[campo] ?? '').trim() && cat[dato]) cert[campo] = cat[dato];
    }
  }

  const doc = await PDFDocument.load(templateBytes);
  const form = doc.getForm();

  const checkboxes = cert.checkboxes || {};
  for (const [key, fieldName] of Object.entries(CASILLAS)) {
    const box = form.getCheckBox(fieldName);
    if (checkboxes[key]) box.check();
    else box.uncheck();
  }

  // Claves del payload: TextoN_descripcion → campo PDF TextoN (guía §10.2).
  for (const [key, value] of Object.entries(cert)) {
    const m = key.match(/^(Texto\d+)_/);
    if (!m) continue;
    form.getTextField(m[1]).setText(String(value ?? ''));
  }

  // No aplanamos a propósito: el certificado queda editable para que Marta/Jorge
  // corrijan erratas a mano (no tienen acceso a n8n). La firma de Marta es el candado
  // real. Los 3 ejemplares son widgets de un mismo campo → corregir una vez actualiza
  // los 3. save() regenera los appearance streams (updateFieldAppearances por defecto)
  // así que los valores se ven rellenos sin necesidad de aplanar.
  // ponytail: sin flatten a propósito; si el Consell exigiera PDF plano, re-añadir form.flatten().
  return doc.save();
}

// --- Emplazamiento y Situación (A3 sin formulario: composición por coordenadas §10.3) ---
// Coordenadas de la guía §10.3, calibradas con render real: la plantilla ya imprime las
// etiquetas "Ubicación:" y "Referencia Catastral:" en x=61, así que el VALOR se dibuja a
// su derecha (x=175). Si la plantilla cambia, retocar aquí y re-ejecutar `npm run poc`.
const A3 = {
  emplazamiento: { x: 61, y: 312, w: 576, h: 441 },
  fotoFachada: { x: 650, y: 496, w: 192, h: 257 },
  textoUbicacion: { x: 175, y: 293 },
  textoReferencia: { x: 200, y: 276 },
  fontSize: 10,
};

async function embedImage(doc, bytes, label) {
  const b = new Uint8Array(bytes);
  if (b[0] === 0xff && b[1] === 0xd8) return doc.embedJpg(bytes);
  if (b[0] === 0x89 && b[1] === 0x50) return doc.embedPng(bytes);
  throw new Error(`${label}: formato no soportado (usar JPG o PNG; HEIC no está soportado)`);
}

function drawContained(page, img, rect) {
  const scale = Math.min(rect.w / img.width, rect.h / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  page.drawImage(img, { x, y, width: w, height: h });
  return { x, y, w, h }; // dónde quedó la imagen en la página (para dibujar overlays alineados)
}

// Contorno de la parcela sobre el mapa. La imagen WMS cubre `bbox` (cuadrado, EPSG:25831) y se
// colocó en `placed`; ambos con Y hacia arriba → transform mundo→punto lineal y exacto (sin flip).
function drawContorno(page, rings, bbox, placed, color = rgb(0.09, 0.15, 0.85)) {
  const sx = placed.w / (bbox.maxX - bbox.minX);
  const sy = placed.h / (bbox.maxY - bbox.minY);
  const pt = ([X, Y]) => ({ x: placed.x + (X - bbox.minX) * sx, y: placed.y + (Y - bbox.minY) * sy });
  for (const ring of rings)
    for (let i = 0; i + 1 < ring.length; i++)
      page.drawLine({ start: pt(ring[i]), end: pt(ring[i + 1]), thickness: 1.5, color });
}

export async function composeEmplazamiento(templateBytes, payload, fotoFachadaBytes, capturaBytes) {
  const empl = payload.emplazamiento || {};
  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (capturaBytes) {
    // Captura aportada (override manual): se coloca tal cual, sin contorno (ya lo trae).
    drawContained(page, await embedImage(doc, capturaBytes, 'capturaEmplazamiento'), A3.emplazamiento);
  } else {
    // Sin captura → se genera desde el Catastro con la ref. catastral y se dibuja el contorno.
    const { png, bbox, rings } = await capturaEmplazamiento(empl.referenciaCatastral);
    const placed = drawContained(page, await doc.embedPng(png), A3.emplazamiento);
    drawContorno(page, rings, bbox, placed);
  }
  drawContained(page, await embedImage(doc, fotoFachadaBytes, 'fotoFachada'), A3.fotoFachada);

  const texto = (t, pos) =>
    page.drawText(String(t || ''), { x: pos.x, y: pos.y, size: A3.fontSize, font, color: rgb(0, 0, 0) });
  texto(empl.ubicacion, A3.textoUbicacion);
  texto(empl.referenciaCatastral, A3.textoReferencia);
  // Cajetín (arquitecto/colegiado/email) viene fijo en la plantilla — no se toca (guía §10.3).

  return doc.save();
}
