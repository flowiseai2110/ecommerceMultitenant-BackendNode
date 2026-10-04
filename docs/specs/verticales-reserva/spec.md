# Spec: verticales de reserva — hotel, agencia de tours y eventos

> Estado: **referencia futura — no es el alcance a construir.** El 2026-10-03 se decidió un alcance mucho menor ("mini booking": vitrina + solicitud que el negocio confirma), en [../mini-booking/spec.md](../mini-booking/spec.md). Este diseño extendido (casi un PMS) queda como referencia por si alguna parte se necesita más adelante.
> Diseño por vertical: [hotel.md](hotel.md) · [tours.md](tours.md) · [eventos.md](eventos.md).
> Patrones de diseño: [patrones.md](patrones.md) · Asesor de ventas IA: [agente-ventas.md](agente-ventas.md) · Referencia PMS: [analisis-infhotel.md](analisis-infhotel.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.

## Problema

La plataforma vende **productos con stock**: un entero (`productos.stock`) que se bloquea con `FOR UPDATE` y se descuenta al crear el pedido (`inventario.service.js`). El checkout está construido alrededor del envío (courier, domicilio, recojo, ubigeo).

Tres tipos de negocio con mucha demanda en Perú venden **capacidad en el tiempo**, no unidades:

| Vertical | Qué se vende | Unidad de inventario |
|---|---|---|
| Hotel / hostal | Noches en un tipo de habitación (o cama en dormitorio) | `tipo de habitación × noche` |
| Agencia de tours | Plazas en una salida programada | `salida (tour × fecha × hora × idioma)` |
| Eventos | Entradas a una función | `tipo de entrada × función` (con tope de aforo de la función) |

Cada uno se trata como **caso específico**: tiene sus propias tablas, reglas, pantallas y configuración. Cuando la tienda elige su tipo de negocio, el backend, el admin y el storefront cargan esa vertical.

## Principios de diseño

1. **`productos` sigue siendo la ficha comercial.** Nombre, slug, descripción, imágenes, categoría, SEO, reseñas, destacado y búsqueda del agente IA ya funcionan sobre `productos`. Cada vertical agrega una tabla **1:1** con sus datos propios (`hotel_tipos_habitacion`, `tours`, `eventos`). Así no se duplica el catálogo ni el storefront base.
2. **`pedidos` sigue siendo el documento de cobro.** Pagos (Culqi + webhooks), comprobante SUNAT, cupones, cliente, "Mis pedidos" y la numeración ya viven ahí. Cada vertical cuelga su **documento operativo** del pedido (`hotel_reservas`, `tour_reservas`, `entradas`). Dinero en `pedidos`, operación en la vertical.
3. **Configuración tipada por vertical**, no JSON genérico. `tienda_configuraciones` (clave → JSONB) sirve para preferencias sueltas, pero las reglas de negocio (hora de check-in, adelanto, corte de venta) se validan y consultan en cada reserva. Van en `config_hotel`, `config_tours` y `config_eventos` (1:1 con la tienda).
4. **El servidor calcula todo precio y toda disponibilidad**, igual que ya pasa con `costoEnvio`. El body del cliente solo trae *qué* quiere, nunca *cuánto cuesta*.
5. **La disponibilidad no depende de un cron.** El backend en Railway (free tier) duerme cuando no hay tráfico: un job que libera retenciones no es confiable. Las retenciones vencidas se **ignoran al calcular** (ver "Retenciones").

## Núcleo común

### 1. Tipo de negocio de la tienda

```sql
-- tiendas.tipo_negocio ya existe (VARCHAR(50) DEFAULT 'productos') y hoy no se usa.
ALTER TABLE tiendas
  ADD CONSTRAINT chk_tiendas_tipo_negocio
    CHECK (tipo_negocio IN ('productos','hotel','tours','eventos')),
  ADD COLUMN zona_horaria VARCHAR(40) NOT NULL DEFAULT 'America/Lima';
```

- Se elige en el **onboarding** de la tienda. Solo se puede cambiar mientras la tienda no tenga pedidos: al cambiar de vertical, los pedidos existentes perderían sentido.
- `zona_horaria` es obligatoria para las verticales: "noche del 10/11", "salida 08:00" y "función 20:00" son horas **locales** del negocio. Las fechas de calendario se guardan como `DATE`/`TIME` locales y los instantes como `TIMESTAMPTZ`.
- Al crear la tienda se inserta su fila `config_<vertical>` con valores por defecto, igual que hoy `metodos-pago-seed.service.js` siembra los métodos de pago.

**Qué se activa y qué se oculta según el tipo:**

| Módulo actual | productos | hotel | tours | eventos |
|---|---|---|---|---|
| Stock / inventario / variantes | ✔ | — | — | — |
| Métodos de envío, zonas, ubigeo destino | ✔ | — | (se reutiliza para zonas de recojo) | — |
| Carrito multi-producto | ✔ | selección de habitaciones de **una** estadía | **una** reserva por salida | entradas de **un** evento |
| Cupones, pagos, comprobante, reseñas, agente IA, campañas, live | ✔ | ✔ | ✔ | ✔ |

### 2. Extensión de `pedidos`

```sql
ALTER TABLE pedidos
  ADD COLUMN tipo            VARCHAR(10) NOT NULL DEFAULT 'compra', -- compra | hotel | tour | evento
  ADD COLUMN fecha_servicio  DATE,          -- check-in / fecha de salida / fecha de la función (ordenar y filtrar)
  ADD COLUMN expira_en       TIMESTAMPTZ,   -- fin de la retención mientras el pedido está 'por_pagar'
  ADD COLUMN monto_adelanto  DECIMAL(10,2), -- lo que se cobra para confirmar (null = total)
  ADD COLUMN monto_pagado    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN politica_cancelacion JSONB,    -- snapshot de la política vigente al reservar
  ADD COLUMN idioma          VARCHAR(5);    -- idioma del cliente (vouchers, correos)
CREATE INDEX idx_pedidos_tienda_fecha_servicio ON pedidos (tienda_id, fecha_servicio);
```

- **Estados del pedido de reserva** (financieros): `por_pagar → confirmado → completado`, más `cancelado` y `expirado`. `estado_pago` suma `parcial` (pagó el adelanto, falta el saldo).
- El **estado operativo** (check-in, en curso, no-show, entrada usada) vive en la tabla de la vertical. Así el flujo de pago no se mezcla con la operación del día.
- `pedido_detalles` se sigue llenando con una línea por concepto cobrado (noche × tipo, pasajero × tipo, entrada × tipo, extras). Comprobante, reportes de venta y reseñas siguen funcionando sin cambios.

### 3. Retenciones de cupo (holds)

Mientras el cliente paga, el cupo debe quedar apartado; si no paga, debe liberarse solo.

```sql
CREATE TABLE retenciones_cupo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     UUID NOT NULL,
  pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  recurso_tipo  VARCHAR(30) NOT NULL,  -- hotel_noche | tour_salida | evento_tipo_entrada
  recurso_id    UUID NOT NULL,         -- tipo de habitación / salida / tipo de entrada
  fecha         DATE,                  -- solo hotel: una fila por noche
  cantidad      INT NOT NULL CHECK (cantidad > 0),
  expira_en     TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_retenciones_recurso ON retenciones_cupo (recurso_tipo, recurso_id, fecha, expira_en);
```

**Disponible = cupo total − confirmados − Σ retenciones con `expira_en > now()`.**

- **Crear reserva:** `FOR UPDATE` sobre las filas del recurso (noches, salida o tipo de entrada, siempre en orden de id para evitar deadlocks, como ya hace `validarYBloquearStock`), cálculo de disponible, `INSERT` de la retención y del pedido `por_pagar` con `expira_en`.
- **Pago confirmado** (webhook Culqi o confirmación manual del admin por Yape/transferencia): en una transacción se bloquea el recurso, se suma a `confirmados`, se borra la retención y el pedido pasa a `confirmado`.
- **Pago que llega tarde** (retención vencida): se revalida. Si hay cupo, se confirma igual. Si no hay, el pedido queda `requiere_atencion` y se avisa al admin para reembolsar. Es el caso borde que más reclamos genera; hay que testearlo.
- **Limpieza:** borrar retenciones vencidas y marcar pedidos `expirado` es solo higiene, no corrección. La puede hacer `pg_cron` en Supabase o cualquier request; si no corre, la disponibilidad sigue siendo correcta.
- **Duración** en `config_<vertical>.minutos_retencion`: unos 15 min con pasarela y unas 2 h con pago manual (Yape + captura por WhatsApp, el flujo actual del checkout).

### 4. Políticas de cancelación

```sql
CREATE TABLE politicas_cancelacion (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id  UUID NOT NULL,
  nombre     VARCHAR(80) NOT NULL,  -- "Flexible", "Moderada", "No reembolsable"
  reglas     JSONB NOT NULL,        -- [{"horas_antes":72,"reembolso_pct":100},{"horas_antes":24,"reembolso_pct":50},{"horas_antes":0,"reembolso_pct":0}]
  texto      TEXT,                  -- redacción para el cliente
  activo     BOOLEAN NOT NULL DEFAULT true
  -- + auditoría
);
```

- Las tres verticales la usan: hotel por plan tarifario, tours por tour y eventos por evento (normalmente "no reembolsable salvo cancelación del organizador").
- Al reservar se copia como **snapshot** en `pedidos.politica_cancelacion`, igual que el comprobante: si la tienda cambia la política después, la reserva conserva la que el cliente aceptó.
- El reembolso se calcula con la función pura `calcularReembolso(snapshot, inicioServicio, ahora)`, testeable sin BD, como `cotizacion.js`.

### 5. Participantes (huéspedes, pasajeros, asistentes)

```sql
CREATE TABLE participantes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL,
  pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  titular         BOOLEAN NOT NULL DEFAULT false,
  nombres         VARCHAR(100) NOT NULL,
  apellidos       VARCHAR(100),
  tipo_documento  VARCHAR(10),   -- DNI | CE | PASAPORTE
  numero_documento VARCHAR(20),
  nacionalidad    CHAR(2),       -- ISO 3166 (precio nacional/extranjero, exoneración IGV)
  fecha_nacimiento DATE,         -- tipo de pasajero niño/adulto mayor
  email           VARCHAR(100),
  telefono        VARCHAR(20),
  datos           JSONB          -- específicos: alergias, talla, contacto de emergencia...
);
CREATE INDEX idx_participantes_pedido ON participantes (pedido_id);
```

- **Hotel:** registro de huéspedes (el reglamento de hospedajes exige identificarlos al check-in).
- **Tours:** lista de pasajeros / manifiesto (pasaporte para Machu Picchu, edad para tarifa niño).
- **Eventos:** titular de cada entrada nominativa.
- Cada vertical decide qué campos exige y cuándo: al reservar, antes del servicio (link "completa tus datos") o en el check-in.

### 6. Arquitectura del backend: una estrategia por vertical

```
modules/reservas/
  nucleo/            retenciones.js, politicas.js (calcularReembolso), participantes.js
  hotel/             hotel.service.js, disponibilidad.js, tarifas.js (puras), rutas admin/store
  tours/             tours.service.js, salidas.js, precios.js (puras), rutas admin/store
  eventos/           eventos.service.js, entradas.js, qr.js, rutas admin/store
  reservas.strategy.js
```

Cada vertical implementa la misma interfaz y `pedidos.service` delega según `tienda.tipoNegocio`:

```js
{
  cotizar(tx, tiendaId, solicitud)        // → { lineas, subtotal, adelanto, politica } — precio del servidor
  retener(tx, tiendaId, pedidoId, sol)    // FOR UPDATE + valida + INSERT retenciones_cupo
  confirmar(tx, pedido)                   // retención → confirmado; crea documento operativo
  cancelar(tx, pedido, motivo)            // libera cupo y devuelve el reembolso calculado
}
```

El pago, el comprobante, el cupón y el cliente siguen en `pedidos.service` sin duplicarse.

### 7. Frontend

- **FrontendStore:** `tienda.tipoNegocio` ya llega en el resolver de la tienda. `store.routes.ts` carga rutas **lazy** por vertical (`features/verticales/hotel|tours|eventos`) para la búsqueda, la ficha y el checkout. Home, tema, campañas, reseñas y cuenta se comparten; "Mis pedidos" pasa a "Mis reservas" / "Mis entradas".
- **Checkout:** hoy tiene 2.145 líneas acopladas al envío. Antes de cualquier vertical hay que dividirlo en pasos: *contacto → **paso de logística** (envío / estadía / pasajeros / asistentes) → comprobante → pago*. Cada vertical aporta solo su paso de logística.
- **Contador de la retención** ("tu reserva se guarda 14:59"): el `setInterval` debe correr fuera de la zona de Angular y arrancar tras `afterNextRender`. Los timers dentro de la zona ya rompieron la estabilidad y el scroll del router en esta app.
- **FrontendAdmin:** el menú se arma según el tipo. Las pantallas propias de cada vertical están en su documento.
- **i18n:** turismo (hotel y tours) vende a extranjeros. Se necesita el contenido del producto en ES/EN (`productos.traducciones JSONB`) y la interfaz del storefront traducida. Eventos lo necesita mucho menos.

### 8. Otras piezas compartidas

- **Recordatorios programados** (24 h antes del check-in, la salida o la función): necesitan un disparador que no dependa de que Railway esté despierto, por ejemplo `pg_cron` + `pg_net` llamando a un endpoint, o un cron de Railway.
- **Reseñas:** hoy la regla es "pedido entregado". Pasa a "servicio completado" según la vertical (check-out, salida completada, función finalizada).
- **Agente IA:** se le suma una herramienta por vertical (`consultar_disponibilidad_hotel`, `consultar_salidas`, `consultar_entradas`) que llama al mismo `cotizar`.
- **QR:** tours y eventos validan acceso con QR. Hay un solo helper (`nucleo/qr.js`: token firmado con HMAC) y un solo **escáner PWA** en el admin.
- **Libro de reclamaciones** (ya especificado en `specs/libro-reclamaciones`): obligatorio en las tres.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| `productos` como ficha + tabla 1:1 por vertical | Reutiliza catálogo, imágenes, SEO, reseñas y agente IA sin tocarlos | Tablas de catálogo nuevas por vertical (duplica todo el storefront) |
| `pedidos` como documento de cobro + documento operativo por vertical | Pagos, comprobante y cupones ya funcionan y están probados | Tabla `reservas` genérica que reemplace a `pedidos` (reescribe pagos y SUNAT) |
| Configuración en tablas tipadas `config_<vertical>` | Se valida con Zod, se consulta en cada reserva y tiene defaults en SQL | Claves sueltas en `tienda_configuraciones` |
| Retenciones calculadas (ignorar vencidas), no liberadas por job | Railway duerme; un cron caído causaría falso "agotado" | Contador `retenidos` + job de liberación |
| Política de cancelación como snapshot en el pedido | El cliente conserva las condiciones que aceptó | Leer la política vigente al cancelar |
| Una sola tabla `participantes` | Misma forma en las tres verticales; los campos propios van en `datos` | Tablas de huéspedes, pasajeros y asistentes separadas |
| Tipo de negocio fijo tras el primer pedido | Evita pedidos huérfanos de otra vertical | Permitir cambio libre |

## Fuera de alcance (todas las verticales)

- Marketplace multi-tienda (buscar hoteles o tours de varias tiendas a la vez).
- Multimoneda real con varias listas de precios. Por ahora hay **una moneda por tienda** (`tiendas.moneda`, que puede ser USD) y, como mucho, una conversión **referencial** en pantalla.
- Facturación de comisiones a revendedores (ver "afiliados" en tours, fase 2).

## Estado del análisis: qué está cubierto y qué falta

**Cubierto:** modelo de datos y reglas de las tres verticales, núcleo común (retenciones, políticas, participantes), patrones de diseño, asesor de ventas IA por vertical y pantallas principales del storefront y del admin.

**Falta antes de implementar** (en orden de impacto):

| # | Tema | Por qué importa | Dónde iría |
|---|---|---|---|
| B1 | **Validación con negocios reales** (3-5 agencias de tours) | Hoy el diseño se basa en cómo opera el rubro en general. Falta confirmar cómo venden hoy (WhatsApp, Excel, OTAs), qué les duele más, qué pagarían y si el MVP de tours les sirve | Entrevistas + nota en `tours.md` |
| B2 | **Comprobantes con adelanto (SUNAT)** | Cobrar un adelanto obliga a emitir comprobante del anticipo y luego el final descontándolo. Hoy `pedidos.comprobante` es uno solo por pedido | Núcleo, con contador |
| B3 | **Reembolsos** | La cancelación calcula el monto, pero falta el flujo: reembolso por Culqi (`PaymentProvider.refund` ya existe), devolución manual por Yape/transferencia con registro, reembolsos parciales y estado en `pagos` | Núcleo |
| B4 | **Contratos de API** | Endpoints store/admin con request/response por vertical. Sin esto, el admin y el storefront no se pueden trabajar en paralelo | `plan.md` por vertical |
| B5 | **Onboarding y diseño por vertical** | Elegir el tipo al crear la tienda, datos de ejemplo y secciones nuevas de la home (buscador de fechas, calendario de salidas, cuenta regresiva) dentro del roadmap de personalización (`secciones.schema.js`) | Núcleo + personalización |
| B6 | **Notificaciones por vertical** | Las plantillas de WhatsApp y correo hoy siguen los estados del pedido (enviado, entregado). Faltan voucher, recordatorio 24 h, hora de recojo, salida cancelada, check-in online | Núcleo (eventos de dominio) |
| B7 | **SEO con datos estructurados** | Google muestra resultados enriquecidos para eventos (`Event`), hoteles (`Hotel`, `HotelRoom`) y tours (`TouristTrip`, `Product` + `Offer`). Es un canal de adquisición gratuito | Cada vertical |
| B8 | **i18n** | Mencionado pero no diseñado: modelo de traducciones, selector de idioma, URLs por idioma y correos en inglés | Núcleo |
| B9 | **Planes del SaaS por vertical** | Qué incluye cada plan (tours activos, habitaciones, entradas por mes, comisión por entrada) y cómo se mide en `tienda_uso_recursos` | Producto / `planes` |
| B10 | **Estrategia de pruebas** | Tests de concurrencia (dos personas por la última plaza), de retenciones vencidas, de zona horaria y del pago que llega tarde | `tasks.md` por vertical |
| B11 | **Plan de tareas** | `plan.md` + `tasks.md` por vertical, empezando por tours | Carpeta de la spec |

**Ya resuelto en otros módulos (no falta):** Libro de Reclamaciones (aplica igual, con `bien_tipo = servicio` y el pedido de la reserva) y reseñas (cambia solo la regla de cuándo se puede reseñar).

## Puntos a validar con un contador (SUNAT)

- **Hospedaje y paquetes turísticos a no domiciliados**: pueden calificar como exportación de servicios (IGV 0%) con requisitos de documentación (pasaporte, permanencia). Afecta el tipo de comprobante y el cálculo del total; está modelado como flag en `config_hotel` / `config_tours`.
- **Eventos**: impuesto municipal a los espectáculos públicos no deportivos y la regulación de INDECOPI sobre devolución por cancelación o postergación.
