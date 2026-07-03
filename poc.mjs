// POC paso 4 de la guía §13: generar los 2 PDFs con JSON fijo sobre las plantillas
// REALES del repo. Si esto falla, no seguir con WF03/WF04. Uso: npm run poc
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import { fillCertificado, composeEmplazamiento } from './pdf.mjs';

const ROOT = new URL('..', import.meta.url); // raíz del repo
const tplCert = readFileSync(new URL('CertifHabitabilidad_Vacio.pdf', ROOT));
const tplA3 = readFileSync(new URL('Emplazamiento_Plantilla.pdf', ROOT));

// Payload de ejemplo de la guía §9
const payload = {
  expedienteCodigo: 'POC_CHCEE_Arago301_Prueba',
  certificadoHabitabilidad: {
    checkboxes: { renovacion: true, carencia: false, vivienda: true, local: false, edificioResidencialNoVivienda: false },
    Texto1_tecnico: 'Jorge Bennassar Oliver',
    Texto2_titulo: 'Arquitecto',
    Texto3_colegio: 'Arquitectos de las Islas Baleares',
    Texto4_colegiado: '82783.5',
    Texto5_municipio: 'PALMA DE MALLORCA',
    Texto6_localidad: 'PALMA DE MALLORCA',
    Texto7_parajeBarrio: 'PALMA DE MALLORCA',
    Texto8_referenciaCatastral: '2929601DD7822H0119YQ',
    Texto9_callePlaza: 'ARAGÓ 301',
    Texto10_codigoPostal: '07009',
    Texto11_bloque: '',
    Texto12_escalera: '',
    Texto13_piso: '01',
    Texto14_puerta: '001',
    Texto15_uso: 'RESIDENCIAL',
    Texto16_numeroPlazas: '4',
    Texto17_dia: '01',
    Texto18_mes: 'Junio',
    Texto19_anio: '2026',
  },
  emplazamiento: {
    ubicacion: 'CL ARAGO 301 Pl:01 Pt:001 07009 PALMA (ILLES BALEARS)',
    referenciaCatastral: '2929601DD7822H0119YQ',
    numeroPlano: '00',
    documento: 'EMPLAZAMIENTO Y SITUACIÓN',
    formato: 'A3',
    arquitecto: 'JORGE BENNASSAR OLIVER',
    colegiado: '82783.5',
    emailResponsable: 'bennassarjorge4@gmail.com',
  },
};

// Imágenes de prueba generadas al vuelo (PNG válido por construcción); en real vienen del técnico.
import { deflateSync } from 'node:zlib';
function makePng(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).fill(Buffer.from([r, g, b]))]);
  const idat = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const fotoFachada = makePng(60, 40, [180, 120, 80]);   // rectángulo "fachada"
const capturaEmpl = makePng(40, 30, [90, 140, 200]);   // rectángulo "emplazamiento"

// 1) Certificado: rellena AcroForm y aplana
const certPdf = await fillCertificado(tplCert, payload);
assert.strictEqual(Buffer.from(certPdf.slice(0, 4)).toString(), '%PDF', 'certificado no es un PDF');
const certDoc = await PDFDocument.load(certPdf);
assert.strictEqual(certDoc.getPageCount(), 3, 'el certificado debe conservar 3 páginas');
assert.strictEqual(certDoc.getForm().getFields().length, 0, 'el formulario debe quedar aplanado');

// 2) Emplazamiento A3: composición por coordenadas
const emplPdf = await composeEmplazamiento(tplA3, payload, fotoFachada, capturaEmpl);
assert.strictEqual(Buffer.from(emplPdf.slice(0, 4)).toString(), '%PDF', 'emplazamiento no es un PDF');
const emplDoc = await PDFDocument.load(emplPdf);
assert.strictEqual(emplDoc.getPageCount(), 1, 'el A3 debe tener 1 página');
const { width, height } = emplDoc.getPage(0).getSize();
assert.ok(Math.round(width) === 1191 && Math.round(height) === 842, 'tamaño A3 apaisado esperado');

// 3) Formato no soportado debe fallar claro (HEIC/otros)
await assert.rejects(
  () => composeEmplazamiento(tplA3, payload, Buffer.from('no-imagen'), capturaEmpl),
  /formato no soportado/,
);

mkdirSync(new URL('out/', import.meta.url), { recursive: true });
writeFileSync(new URL('out/POC_Certificado_Habitabilidad.pdf', import.meta.url), certPdf);
writeFileSync(new URL('out/POC_Emplazamiento_Situacion.pdf', import.meta.url), emplPdf);
console.log('POC OK — revisa visualmente pdf-service/out/*.pdf');
