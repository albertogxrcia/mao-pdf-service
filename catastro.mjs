// Captura de emplazamiento desde los servicios ABIERTOS del Catastro (sin navegador).
// Dada la referencia catastral, devuelve { png, bbox, rings }: el mapa WMS centrado en la
// parcela + su geometría en el MISMO CRS, para dibujar el contorno alineado sobre el mapa.
// Verificado 2026-07-04 con RC 2929601DD7822H (Palma). Servicios oficiales, uso libre y gratuito.
//
// ponytail: SRS fijo EPSG:25831 (UTM 31N) porque MAO solo tramita en Mallorca/Balears (todo 31N).
//   Si algún día operan en península, derivar la zona del centroide: zone=floor((lon+180)/6)+1,
//   epsg=25800+zone (pidiendo antes el centroide en EPSG:4326).
const SRS = 'EPSG:25831';
const WFS = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';
const WMS = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';

// Todo error de esta ruta se marca .catastro=true → el server responde 422 (no 400) para que
// WF04 lo lea como "captura no disponible, a Revisión" y no como un fallo del microservicio.
function fallo(msg) {
  const e = new Error(msg);
  e.catastro = true;
  return e;
}

async function pedir(url, ms) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw fallo(`Catastro no responde (${url.split('?')[0]}): ${e.message}`);
  }
  if (!r.ok) throw fallo(`Catastro ${r.status} en ${url.split('?')[0]}`);
  return r;
}

// GetParcel → anillos [[ [x,y], ... ], ...] en EPSG:25831 (posList es "x y x y ...", srsDimension=2).
async function geometria(rc14) {
  const url = `${WFS}?service=wfs&version=2.0.0&request=getfeature`
    + `&STOREDQUERIE_ID=GetParcel&refcat=${rc14}&srsname=EPSG::25831`;
  const gml = await (await pedir(url, 20000)).text();
  if (/numberMatched="0"/.test(gml)) throw fallo(`parcela ${rc14} no encontrada en el Catastro`);
  const rings = [...gml.matchAll(/<gml:posList[^>]*>([\s\d.eE+-]+)<\/gml:posList>/g)].map((m) => {
    const n = m[1].trim().split(/\s+/).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return pts;
  });
  if (!rings.length || rings[0].length < 3) throw fallo(`geometría vacía para ${rc14}`);
  return rings;
}

// Recuadro CUADRADO (para que el mapa no se deforme) que enmarca la parcela con margen.
// Suelo de 150 m de lado: un piso pequeño igual muestra la manzana y las calles, como el visor.
export function bboxCuadrado(rings, margenFrac = 0.2, minLado = 150) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = Math.max((maxX - minX), (maxY - minY)) * (1 + 2 * margenFrac) / 2;
  const h = Math.max(half, minLado / 2);
  return { minX: cx - h, minY: cy - h, maxX: cx + h, maxY: cy + h };
}

// GetMap → PNG de la cartografía catastral (capa "Catastro", idéntica al visor).
async function mapa(bbox, px = 1000) {
  const url = `${WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Catastro&STYLES=&SRS=${SRS}`
    + `&BBOX=${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/png`;
  const buf = Buffer.from(await (await pedir(url, 25000)).arrayBuffer());
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw fallo('el WMS no devolvió PNG (excepción del servicio)');
  return buf;
}

// Normaliza a los 14 primeros caracteres = la PARCELA (el mapa es a nivel de parcela; los
// 6 últimos de la RC completa identifican el inmueble concreto, que aquí no aplica).
export function rc14de(rcCompleta) {
  const rc = String(rcCompleta || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 14);
  if (rc.length < 14) throw fallo(`referencia catastral inválida: "${rcCompleta}"`);
  return rc;
}

export async function capturaEmplazamiento(rcCompleta) {
  const rc14 = rc14de(rcCompleta);
  const rings = await geometria(rc14);
  const bbox = bboxCuadrado(rings);
  const png = await mapa(bbox);
  return { png, bbox, rings };
}
