# Plan técnico: checkout con envío por zonas, comprobante y paso de pago

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo del checkout (FrontendStore)

```
Paso 1 · Tu pedido
  datos de contacto
  ¿Dónde recibes tu pedido?  ← app-ubicacion-selector (zona recordada en UbicacionEntregaService)
    → GET /store/envios/cotizar?ubigeo&subtotal   (re-cotiza al cambiar zona o subtotal)
  métodos de envío visibles con su precio          (disponible=false se ocultan)
  panel del método: agencia (courier) / dirección (delivery, con zonaFija) / recojo

Paso 2 · Pago y comprobante
  selector de método de pago → datos con botón Copiar + QR + monto (si el total es definitivo)
  comprobante: boleta (DNI opcional < S/ 700) | factura (RUC, razón social, dirección fiscal)

Paso 3 · Confirmar
  resumen con "Editar" por sección → POST /store/pedidos { metodoEnvioId, comprobante, ... }
    backend: cotizarMetodoEnvio() recalcula costoEnvio; valida comprobante; crea pedido

Paso 4 · Pedido creado
  número + total + datos de pago para copiar + "Ya pagué — Enviar comprobante" (WhatsApp)
```

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Zonas como **prefijos UBIGEO INEI** (`15`, `1501`, `150122`, `*`) | El código es jerárquico: una zona "Lima Metropolitana" es un solo prefijo, no 43 filas. El vendedor piensa en grupos | Tabla tarifa-por-distrito (1,800+ filas, imposible de mantener) |
| Gana el prefijo más largo | Permite "provincia a S/ 12, salvo Miraflores a S/ 8" sin exclusiones | Orden manual de prioridad |
| `fuera_de_zona` por método (`coordinar` por defecto) | El delivery propio es relativo al almacén (conviene "no ofrecer"); un courier puede preferir coordinar | Ocultar siempre: rompería tiendas sin zonas |
| Método sin zonas = comportamiento anterior | Despliegue sin migrar datos: nada cambia hasta que el dueño configure | Exigir zonas para activar el método |
| Tarifas fijas, sin peso | Por debajo de ~50 pedidos/mes es lo práctico, y los productos no tienen peso cargado | API de courier en tiempo real |
| El **servidor** calcula `costoEnvio` | El body era manipulable (`costoEnvio: 0`). Sin `metodoEnvioId` (cliente antiguo) se fuerza 0, como ya pasaba | Validar el valor del cliente contra la cotización |
| Lógica de cotización como función pura (`cotizacion.js`) | Testeable sin BD; la usan el endpoint público y la creación del pedido | Lógica dentro del servicio con Prisma |
| `PUT /zonas` reemplaza la lista completa en una transacción | El editor del admin trabaja la lista entera; evita CRUD por zona y estados intermedios | CRUD por zona |
| Comprobante como snapshot en `pedidos` | El mismo cliente puede pedir boleta a su nombre y factura de su empresa | Guardarlo en `clientes` |
| Regla S/ 700 validada en el servicio | Solo el servidor conoce el total real (incluye envío cotizado) | Validarla solo en el frontend |
| Zona del checkout tras `afterNextRender` | Viene de localStorage (no existe en SSR) y cambia ramas del template; hacerlo antes rompe la hidratación (mismo motivo que `restaurarPaso`) | Fijarla en `ngOnInit` |
| Datos de pago visibles antes de confirmar | Da confianza y evita volver atrás; el riesgo (pagar un monto incompleto) se cubre ocultando el monto si el envío está por coordinar | Mostrarlos solo tras confirmar |

## Modelo de datos

Scripts para el SQL Editor de Supabase (después: `npx prisma generate`):

```sql
-- docs/sql/pedido_comprobante_setup.sql
ALTER TABLE pedidos ADD COLUMN comprobante_doc_tipo VARCHAR(10), comprobante_doc_numero VARCHAR(20),
                    razon_social VARCHAR(200), direccion_fiscal TEXT;
ALTER TABLE tiendas ADD COLUMN emite_factura BOOLEAN NOT NULL DEFAULT true;

-- docs/sql/zonas_envio_setup.sql
ALTER TABLE metodos_envio ADD COLUMN fuera_de_zona VARCHAR(20) NOT NULL DEFAULT 'coordinar',
                          ADD COLUMN pago_en_destino BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE zonas_envio (id, tienda_id, metodo_envio_id → metodos_envio ON DELETE CASCADE,
                          nombre, costo, dias_min, dias_max, ubigeos VARCHAR(6)[], orden, fecha_registro);
```

`pedidos.comprobante` (`boleta`/`factura`/`ninguno`) ya existía.

## Contratos

### `GET /store/envios/cotizar?tiendaId=&ubigeo=150122&subtotal=120`
Sin caché (depende del destino y del carrito). Devuelve una fila por método activo:
```json
{ "metodoEnvioId": "…", "disponible": true, "modo": "fijo", "costo": 8,
  "costoReferencial": null, "zona": "Lima Centro", "diasMin": 1, "diasMax": 2 }
```
`modo`: `fijo` (suma al total) · `gratis` (recojo o envío gratis por monto) · `destino` (pago en destino; `costoReferencial` = flete) · `coordinar`.

### `GET|PUT /admin/metodos-envio/:id/zonas`
PUT body: `{ zonas: [{ nombre, costo, diasMin?, diasMax?, ubigeos: ["1501", "150122", "*"] }] }` (máx. 50 zonas, 500 prefijos por zona).

### `POST /store/pedidos` (campos nuevos)
```json
{ "metodoEnvioId": "uuid", "ubigeoCode": "150122",
  "comprobante": { "tipo": "factura", "docTipo": "RUC", "docNumero": "20123456789",
                   "razonSocial": "…", "direccionFiscal": "…" } }
```
`costoEnvio` del body se ignora.

## Archivos

**BackendNode**
- `modules/envios/cotizacion.js`: `resolverZona`, `cotizarMetodo` (puras) + `__tests__/cotizacion.test.js`
- `modules/envios/cotizacion.service.js`: `cotizarEnvios` (endpoint), `cotizarMetodoEnvio` (transacción del pedido)
- `modules/envios/cotizacion.store.routes.js` → montado en `routes/store/index.js` como `/envios`
- `modules/envios/zonas-envio.schema.js`, rutas de zonas en `metodos-envio.admin.routes.js`, campos nuevos en `metodos-envio.schema.js`
- `modules/ordenes/pedidos.schema.js` (`comprobante`, `metodoEnvioId`) + `__tests__/pedidos.schema.comprobante.test.js`
- `modules/ordenes/pedidos.service.js`: costo de envío en el servidor, reglas de comprobante
- `prisma/schema.prisma`, `docs/sql/*.sql`

**FrontendAdmin**
- `pages/metodos-envio/zonas-envio-editor/` (nuevo; reutiliza `shared/ubigeo-selector`)
- `pages/metodos-envio/metodo-envio-form/` (sección Cobertura + editor), `models/metodo-envio.model.ts`, `services/metodos-envio.service.ts`

**FrontendStore**
- `features/checkout/checkout-page/checkout-page.component.ts`: zona, cotización, selector de pago, comprobante, pasos
- `features/checkout/components/agencia-picker` (`precios`, `nota`), `domicilio-picker` (`zonaFija`)
- `features/checkout/services/metodo-envio.service.ts` (`cotizar`), `checkout.service.ts` (request y WhatsApp)
- `models/metodo-envio.model.ts` (`CotizacionEnvio`), `pedido.model.ts` (`ComprobanteSolicitud`, `metodoEnvioId`), `tienda.model.ts` (`emiteFactura`)
