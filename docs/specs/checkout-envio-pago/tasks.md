# Tareas: checkout con envío por zonas, comprobante y paso de pago

> Implementa [spec.md](spec.md) según [plan.md](plan.md). Marcar `[x]` al cerrar cada tarea.

## Cómo retomar

1. Aplicar la **Fase 0** (SQL) **antes** de arrancar o desplegar el backend. El cliente Prisma ya está regenerado con las columnas nuevas: sin ellas fallan los pedidos **y también el listado de métodos de envío** (Prisma selecciona `fuera_de_zona`/`pago_en_destino`).
2. Seguir con la Fase 6 (verificación) en orden.
3. Commitear (Fase 7). Todo está escrito pero **sin commit** en BackendNode, FrontendAdmin y FrontendStore (rama `main`). En FrontendStore, `checkout-page` y `domicilio-picker` ya tenían cambios previos sin commit (ubicación/ubigeo); revisar el diff antes de commitear.

Orden de despliegue: SQL → backend → admin y tienda. Una tienda nueva con backend viejo sigue funcionando: si `/store/envios/cotizar` falla, el checkout cae al comportamiento anterior (envío por coordinar).

## Fase 0 — Base de datos (bloqueante)

- [ ] **T0.1** `docs/sql/pedido_comprobante_setup.sql` en el SQL Editor de Supabase.
  - Verificar: `select column_name from information_schema.columns where table_name='pedidos' and column_name like 'comprobante_doc%';` → 2 filas.
- [ ] **T0.2** `docs/sql/zonas_envio_setup.sql`.
  - Verificar: `select count(*) from zonas_envio;` → 0 sin error; `metodos_envio.fuera_de_zona` existe.
- [x] **T0.3** `npx prisma generate` en local (en Railway corre solo en `postinstall`).

## Fase 1 — Método de pago (R1)

- [x] **T1.1** Selector de métodos de pago con radios; con uno solo, texto — `checkout-page.component.ts` (`selectMetodoPago`, `formatTipoMetodo`).
- [x] **T1.2** El método elegido viaja al pedido, al WhatsApp y a la confirmación; se recuerda en el borrador (`metodoPagoId`).

## Fase 2 — Comprobante (R2)

- [x] **T2.1** Columnas `pedidos.comprobante_doc_tipo/numero`, `razon_social`, `direccion_fiscal`; `tiendas.emite_factura`.
- [x] **T2.2** `comprobanteSchema` (Zod) con formatos DNI/CE/RUC y campos obligatorios de factura — `pedidos.schema.js` + 7 tests.
- [x] **T2.3** Regla S/ 700 y "solo boletas" en `pedidos.service.js` (con el total real, envío incluido).
- [x] **T2.4** Tarjeta Comprobante en la tienda (boleta por defecto, factura si `emiteFactura`), precarga desde la cuenta, bloque 🧾 en WhatsApp.

## Fase 3 — Zonas de envío: backend (R3)

- [x] **T3.1** `zonas_envio` + `metodos_envio.fuera_de_zona/pago_en_destino` — `schema.prisma`, `docs/sql/zonas_envio_setup.sql`.
- [x] **T3.2** `resolverZona` / `cotizarMetodo` (puras) — `modules/envios/cotizacion.js` + 10 tests (Miraflores/Carabayllo/Callao/Tacna/Cajamarca, envío gratis, pago en destino, Decimal).
- [x] **T3.3** `GET /store/envios/cotizar` (sin caché).
- [x] **T3.4** `GET|PUT /admin/metodos-envio/:id/zonas` (reemplazo en transacción).
- [x] **T3.5** `POST /store/pedidos` con `metodoEnvioId`: costo de envío calculado en el servidor; rechaza métodos que no llegan al distrito; ignora `costoEnvio` del body.

## Fase 4 — Zonas de envío: admin (R3.1)

- [x] **T4.1** Sección "Cobertura" (fuera de zona, pago en destino solo courier) — `metodo-envio-form`.
- [x] **T4.2** `app-zonas-envio-editor`: zonas con costo/días, lugares con `app-ubigeo-selector`, atajos (Lima Metropolitana, Callao, Todo el país), compresión a prefijos al guardar. Compila.

## Fase 5 — Checkout de la tienda (R3.8, R4)

- [x] **T5.1** "¿Dónde recibes tu pedido?" arriba del paso 1, zona recordada, re-cotización por zona y subtotal, métodos sin cobertura ocultos, precio por opción y por agencia.
- [x] **T5.2** `domicilio-picker` acepta `zonaFija` (oculta su selector); `agencia-picker` acepta `precios` y `nota`.
- [x] **T5.3** Envío en el resumen lateral y en el total; `necesitaCoordinarEnvio()` según la cotización.
- [x] **T5.4** 4 pantallas: Tu pedido → Pago y comprobante → Confirmar → Pedido creado; borrador restaura los pasos 2 y 3.
- [x] **T5.5** Datos de pago con botón Copiar (monto, número, titular, banco, cuenta, CCI, N° de pedido), QR solo en pantallas ≥ sm, aviso sin monto cuando el envío está por coordinar. Plantilla `#datosPago` compartida entre el paso 2 y la pantalla de éxito. Compila.

## Fase 6 — Verificación end-to-end (después de la Fase 0)

- [ ] **T6.1** Backend: `npm test` (27 tests de envíos y órdenes ya pasan en local) y `npm run dev` sin errores.
- [ ] **T6.2** Admin: en "Delivery propio" poner "No ofrecer" fuera de zona y crear "Lima Metropolitana S/ 10" (atajo). En el courier crear "Todo el país S/ 18". Guardar, recargar → las zonas persisten agrupadas ("Lima (43)").
- [ ] **T6.3** Tienda con distrito Miraflores → delivery S/ 10 y courier S/ 18; el total suma el envío elegido.
- [ ] **T6.4** Cambiar a Tacna → el delivery desaparece (si estaba elegido, se deselecciona); courier S/ 18.
- [ ] **T6.5** Método sin zonas → "Costo a confirmar por WhatsApp" y aviso sin monto en el paso de pago (comportamiento anterior).
- [ ] **T6.6** Paso 2: con Yape, Plin y transferencia activos se ven los tres; al elegir cada uno aparecen sus datos con "Copiar" y el portapapeles recibe el valor (monto como `149.90`).
- [ ] **T6.7** Boleta de S/ 750 sin DNI → no deja continuar; con DNI de 8 dígitos sí. Factura con RUC `20…` + razón social + dirección → el pedido guarda los 4 campos.
- [ ] **T6.8** Manipular el request (`costoEnvio: 0` con un método de S/ 10) → el pedido se guarda con S/ 10.
- [ ] **T6.9** Pantalla "Pedido creado": monto del backend, N° de pedido copiable, "Ya pagué — Enviar comprobante" abre WhatsApp con el N° y el monto.
- [ ] **T6.10** Recargar en los pasos 2 y 3 → vuelve al mismo paso con el método de pago y la zona; sin errores de hidratación en consola (NG0500).

## Fase 7 — Cierre

- [ ] **T7.1** Commit por repo (BackendNode, FrontendAdmin, FrontendStore).
- [ ] **T7.2** Corregir la validación de `tiendas.ubigeo` en el admin (`tienda-form`: pide 8 dígitos, el INEI tiene 6) antes de usarlo como origen de almacén.

## Pendientes (fuera de esta spec)

- Mostrar el comprobante (y la zona cotizada) en el detalle de pedido del admin; interruptor de `emiteFactura` en el formulario de tienda.
- Conectar la pasarela Culqi (ya existe en `modules/pagos/pasarela/`) al método `tarjeta` del checkout.
- Autocompletar razón social y dirección desde el RUC.
- Varios almacenes por tienda; recargo por peso o API del courier.
