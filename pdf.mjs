// Generación de los 2 PDF de MAO (guía §9/§10). Funciones puras sobre bytes:
// el server y el POC las comparten. Sin estado, sin disco.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

export async function fillCertificado(templateBytes, payload) {
  const cert = payload.certificadoHabitabilidad || {};
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

  form.flatten(); // los 3 ejemplares (widgets por página) quedan escritos y no editables
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
  page.drawImage(img, { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, width: w, height: h });
}

export async function composeEmplazamiento(templateBytes, payload, fotoFachadaBytes, capturaBytes) {
  const empl = payload.emplazamiento || {};
  const doc = await PDFDocument.load(templateBytes);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  drawContained(page, await embedImage(doc, capturaBytes, 'capturaEmplazamiento'), A3.emplazamiento);
  drawContained(page, await embedImage(doc, fotoFachadaBytes, 'fotoFachada'), A3.fotoFachada);

  const texto = (t, pos) =>
    page.drawText(String(t || ''), { x: pos.x, y: pos.y, size: A3.fontSize, font, color: rgb(0, 0, 0) });
  texto(empl.ubicacion, A3.textoUbicacion);
  texto(empl.referenciaCatastral, A3.textoReferencia);
  // Cajetín (arquitecto/colegiado/email) viene fijo en la plantilla — no se toca (guía §10.3).

  return doc.save();
}
