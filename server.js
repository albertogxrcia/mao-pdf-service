// Microservicio PDF MAO — contrato guía §9: 2 endpoints multipart que devuelven application/pdf.
import express from 'express';
import multer from 'multer';
import { fillCertificado, composeEmplazamiento } from './pdf.mjs';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const app = express();

function parsePayload(req) {
  if (!req.body?.payload) throw new Error('falta el campo "payload" (JSON)');
  return JSON.parse(req.body.payload);
}
function file(req, name) {
  const f = (req.files || []).find((x) => x.fieldname === name);
  if (!f) throw new Error(`falta el fichero "${name}"`);
  return f.buffer;
}
const asPdf = (res, bytes, filename) =>
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${filename}"`).send(Buffer.from(bytes));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/pdf/certificado-habitabilidad', upload.any(), async (req, res) => {
  try {
    const payload = parsePayload(req);
    const pdf = await fillCertificado(file(req, 'template'), payload);
    asPdf(res, pdf, `Certificado_Habitabilidad_${payload.expedienteCodigo || 'expediente'}.pdf`);
  } catch (err) {
    res.status(400).json({ error: 'certificado_failed', message: err.message });
  }
});

app.post('/pdf/emplazamiento-situacion', upload.any(), async (req, res) => {
  try {
    const payload = parsePayload(req);
    const pdf = await composeEmplazamiento(
      file(req, 'template'),
      payload,
      file(req, 'fotoFachada'),
      file(req, 'capturaEmplazamiento'),
    );
    asPdf(res, pdf, `Emplazamiento_Situacion_${payload.expedienteCodigo || 'expediente'}.pdf`);
  } catch (err) {
    res.status(400).json({ error: 'emplazamiento_failed', message: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`pdf-service MAO escuchando en :${port}`));
