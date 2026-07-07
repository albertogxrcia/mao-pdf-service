# pdf-service · Microservicio PDF MAO

Genera los 2 documentos finales (guía §9/§10) fuera de n8n:

| Endpoint | Multipart fields | Respuesta |
|---|---|---|
| `POST /pdf/certificado-habitabilidad` | `payload` (JSON string) + `template` (CertifHabitabilidad_Vacio.pdf) | `application/pdf` A4 3 págs, AcroForm relleno **editable** (sin aplanar: Marta/Jorge corrigen a mano; la firma es el candado) |
| `POST /pdf/emplazamiento-situacion` | `payload` + `template` (Emplazamiento_Plantilla.pdf) + `fotoFachada` (JPG/PNG) + `capturaEmplazamiento` (JPG/PNG, **opcional**) | `application/pdf` A3 compuesto |
| `GET /health` | — | `{ok:true}` |

El `payload` es el JSON de la guía §9 (`certificadoHabitabilidad.TextoN_*` + `checkboxes`,
`emplazamiento.*`). Errores → `400 {error, message}`. HEIC **no** soportado (pedir JPG/PNG al técnico).
El cajetín del A3 (arquitecto/colegiado/email) viene fijo en la plantilla; no se dibuja.

### Captura de emplazamiento automática (Catastro)

Si **no** se aporta `capturaEmplazamiento`, el servicio la genera solo desde los servicios abiertos
del Catastro con `emplazamiento.referenciaCatastral` (`catastro.mjs`, sin navegador): WFS → geometría
de la parcela, WMS → mapa; dibuja el **contorno de la parcela** encima (pdf-lib, mismo CRS EPSG:25831).
Si el Catastro no responde / no encuentra la parcela → **`422 {error:"catastro_unavailable"}`** para que
WF04 enrute el expediente a Revisión (carga manual). Si SÍ se aporta captura, se usa tal cual (override).

## POC (paso 4 guía §13 — obligatorio antes de WF03/WF04)

```bash
cd pdf-service && npm install && npm run poc
```

Usa las plantillas reales del repo y deja `out/POC_*.pdf` para revisión visual
(las coordenadas A3 de la guía §10.3 son punto de partida: validar con estos PDFs).

Captura Catastro (LIVE, requiere red): `npm run test:catastro` → asserts de geometría + genera
`out/TEST_Emplazamiento_Catastro.pdf` (contorno azul sobre la parcela) para revisión visual.

## Desplegar en Easypanel

1. Easypanel → Create Service → App → **Docker** (subir esta carpeta o apuntar al repo, `pdf-service/Dockerfile`).
2. Puerto interno `3000`, sin variables obligatorias (`PORT` opcional).
3. Copiar la URL pública y cablearla en WF04 (parchea los 2 nodos HTTP, con backup):
   `node scripts/set-wf04-pdf-url.mjs https://LA-URL` — verificar después con `node scripts/demo-preflight.mjs`.

Prueba rápida contra el servicio desplegado:

```bash
curl -s -X POST "$URL/pdf/certificado-habitabilidad" \
  -F payload='{"expedienteCodigo":"TEST","certificadoHabitabilidad":{"checkboxes":{"vivienda":true},"Texto1_tecnico":"Prueba"}}' \
  -F template=@../CertifHabitabilidad_Vacio.pdf -o /tmp/cert.pdf && file /tmp/cert.pdf
```
