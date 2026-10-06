# Pruebas de carga (k6)

Scripts de [k6](https://grafana.com/docs/k6/) que imitan el tráfico real del Store y del Admin contra las tiendas sintéticas `carga-NNN` de `scripts/seed-carga.js`.

| Script | Qué simula | Variables principales (default) |
|---|---|---|
| `store-visita.js` | Compradores: portada → categoría → producto → búsqueda → checkout, con pausas humanas | `VISITAS_POR_MIN` (60), `DURACION` (5m) |
| `store-checkout.js` | Pedidos **reales** (descuentan stock) | `PEDIDOS_POR_MIN` (6), `DURACION` (5m) |
| `admin.js` | Dueños: dashboard, pedidos, productos, edición | `SESIONES_POR_MIN` (10), `DURACION` (5m) |
| `escalones.js` | Sube las tiendas activas (10 → 25 → 50 → 100) y da el p95 por escalón | `ESCALONES` (10,25), `VISITAS_POR_TIENDA_MIN` (2), `DURACION_ESCALON` (3m) |

## Preparación (una vez)

1. Datos: `npm run seed:carga -- --tiendas 25 --owner-email carga-admin@yopmail.com --confirmar-db <ref>`
2. `load-tests/.env.local` (no se sube a git): `BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `K6_ADMIN_EMAIL`, `K6_ADMIN_PASSWORD`, `CARGA_KEY`.
3. **Antes de cada campaña:** en Railway, `CARGA_KEY` = el mismo valor de `.env.local`, y desplegar. k6 sale desde una sola IP: sin la clave, el rate limit corta la prueba con 429. **Al terminar, borrar `CARGA_KEY` de Railway.**

## Ejecutar

```bash
npm run carga -- store-visita.js -e VISITAS_POR_MIN=30 -e DURACION=5m
npm run carga -- escalones.js -e ESCALONES=10,25,50,100 -e CDN=no
```

Resultados en `load-tests/resultados/`: `<script>-<fecha>.json` (resumen) y `.html` (gráficos).

Opciones comunes: `TIENDAS`, `PAUSA` (multiplica las pausas; `0.1` para pruebas rápidas), `CDN`, `UMBRAL_STORE_MS`, `UMBRAL_ADMIN_MS`, `UMBRAL_CHECKOUT_MS`.

## Cómo leer los números

- **El edge de Railway es un CDN.** Cachea el catálogo (`Cache-Control: public`). Con `CDN=si` (por defecto) se mide lo que vive un comprador. Con `CDN=no` cada URL lleva `_k6=<aleatorio>` para forzar que llegue al backend: así se mide la capacidad del servidor y de la base.
- **Línea base desde Lima (2026-10-05, sin carga):** una respuesta del CDN tarda unos 82 ms. Una que llega al backend tarda de 300 a 440 ms, y unos 270 ms de eso son solo red (Lima → edge en São Paulo → servidor en EE. UU.). El objetivo de "p95 < 300 ms" no se puede cumplir desde Perú en las respuestas que no salen del CDN. Para la capacidad, compara cada escalón contra esta línea base.
- **Tiempo del servidor, sin red:** consulta `GET /api/v1/metrics` con el header `X-Metrics-Key` durante la prueba.
- **Limpieza:** `npm run seed:carga -- --limpiar --confirmar-db <ref>` borra las tiendas de carga y todo lo que generaron las pruebas.
