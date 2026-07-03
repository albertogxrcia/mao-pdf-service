# pdf-service · Microservicio PDF MAO

Genera los 2 documentos finales (guía §9/§10) fuera de n8n:

| Endpoint | Multipart fields | Respuesta |
|---|---|---|
| `POST /pdf/certificado-habitabilidad` | `payload` (JSON string) + `template` (CertifHabitabilidad_Vacio.pdf) | `application/pdf` A4 3 págs, AcroForm relleno y aplanado |
| `POST /pdf/emplazamiento-situacion` | `payload` + `template` (Emplazamiento_Plantilla.pdf) + `fotoFachada` (JPG/PNG) + `capturaEmplazamiento` (JPG/PNG) | `application/pdf` A3 compuesto |
| `GET /health` | — | `{ok:true}` |

El `payload` es el JSON de la guía §9 (`certificadoHabitabilidad.TextoN_*` + `checkboxes`,
`emplazamiento.*`). Errores → `400 {error, message}`. HEIC **no** soportado (pedir JPG/PNG al técnico).
El cajetín del A3 (arquitecto/colegiado/email) viene fijo en la plantilla; no se dibuja.

## POC (paso 4 guía §13 — obligatorio antes de WF03/WF04)

```bash
cd pdf-service && npm install && npm run poc
```

Usa las plantillas reales del repo y deja `out/POC_*.pdf` para revisión visual
(las coordenadas A3 de la guía §10.3 son punto de partida: validar con estos PDFs).

## Desplegar en Easypanel

1. Easypanel → Create Service → App → **Docker** (subir esta carpeta o apuntar al repo, `pdf-service/Dockerfile`).
2. Puerto interno `3000`, sin variables obligatorias (`PORT` opcional).
3. Copiar la URL pública y ponerla en WF04: reemplazar `PENDIENTE_PDF_SERVICE_URL` en los 2 nodos HTTP.

Prueba rápida contra el servicio desplegado:

```bash
curl -s -X POST "$URL/pdf/certificado-habitabilidad" \
  -F payload='{"expedienteCodigo":"TEST","certificadoHabitabilidad":{"checkboxes":{"vivienda":true},"Texto1_tecnico":"Prueba"}}' \
  -F template=@../CertifHabitabilidad_Vacio.pdf -o /tmp/cert.pdf && file /tmp/cert.pdf
```
