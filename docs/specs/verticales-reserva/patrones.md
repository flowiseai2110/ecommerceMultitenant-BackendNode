# Análisis: patrones de diseño para las verticales de reserva

> Etapa: **análisis** (sin implementación). Complementa [spec.md](spec.md), [tours.md](tours.md), [hotel.md](hotel.md) y [eventos.md](eventos.md).
> Objetivo: decidir *cómo* se estructura el código antes de escribirlo, partiendo de los patrones que el repo ya usa.

## 1. Problemas de diseño a resolver

| # | Problema | Dónde duele si se resuelve mal |
|---|---|---|
| P1 | Tres verticales (+ el ecommerce actual) con el **mismo flujo general** y **reglas distintas** | `if (tipoNegocio === ...)` repartido en servicios, rutas y componentes: cada cambio toca 15 archivos |
| P2 | **Concurrencia sobre cupo** (última plaza de una salida, preventa de un concierto) | Sobreventa o deadlocks |
| P3 | **Cupo apartado mientras se paga**, que debe liberarse solo aunque el servidor duerma | Falso "agotado" o sobreventa |
| P4 | **Precio compuesto** (base → temporada → fin de semana → plan → persona extra → extras → cupón → cargo) | Precios inconsistentes entre storefront, checkout y comprobante |
| P5 | **Validaciones de reserva** que varían por vertical (corte de venta, mínimo de noches, CTA, edad mínima, código de acceso) | Métodos de 300 líneas imposibles de testear |
| P6 | **Estados** financieros y operativos con transiciones válidas | Hoy `updateEstado` acepta cualquier transición (`pedidos.service.js:444`) |
| P7 | **Efectos secundarios** al confirmar (voucher, email, WhatsApp, "salida garantizada", iCal, recordatorios) | Un fallo de email revierte la reserva, o la reserva se confirma y el voucher nunca sale |
| P8 | **Integraciones externas** (Culqi, iCal de Booking/Airbnb, email, WhatsApp, escáner offline) | Lógica de dominio acoplada al formato de cada proveedor |
| P9 | **Reintentos** (doble clic, red móvil inestable, webhooks repetidos) | Dos reservas o dos cobros por la misma intención |
| P10 | **Operaciones masivas del admin** (reprogramar una salida, cancelar un evento, editar tarifas por rango) | Cambios a medias, sin vista previa ni auditoría |
| P11 | **Inventario en el tiempo** (salidas recurrentes, 365 noches por tipo) | Tablas infladas o dependencia de un cron diario |
| P12 | Storefront y admin que **cambian de pantallas** según la vertical | Componentes gigantes llenos de `@if` (el checkout ya tiene 2.145 líneas) |

## 2. Patrones que el repo ya usa (punto de partida)

| Patrón | Dónde | Cómo se aprovecha |
|---|---|---|
| **Repository → Service → Controller** | `generic.repository.js`, `generic.service.js`, `generic.controller.js` | Se mantiene la capa. Las consultas de disponibilidad necesitan repositorios **específicos** con SQL propio (ver §3.7) |
| **Strategy + registro (Factory)** | `pagos/pasarela/payment-provider.js` (contrato) + `provider-factory.js` (`getProvider(nombre)`) | Es exactamente el molde para las verticales (§3.1). El equipo ya lo conoce |
| **Contexto por request** (AsyncLocalStorage) + extensión de Prisma que inyecta `tiendaId` | `kernel/tenant/`, `config/prisma.js` (`TENANT_SCOPED_MODELS`) | Todas las tablas nuevas con `tienda_id` deben **registrarse en `TENANT_SCOPED_MODELS`**. Ojo: `$queryRaw` **no** pasa por la extensión, así que las consultas `FOR UPDATE` deben filtrar `tienda_id` explícitamente (como ya hace `inventario.service.js`) |
| **Bloqueo pesimista con orden fijo** | `validarYBloquearStock` (`FOR UPDATE ... ORDER BY id`) | Se generaliza a noches, salidas y tipos de entrada (§3.6) |
| **Funciones puras de cálculo** | `envios/cotizacion.js` | Molde para precios, reembolsos y validaciones (§3.3, §3.4) |
| **Snapshot en el pedido** | Comprobante y destino copiados en `pedidos` | Se extiende a precio por noche/pasajero y a la política de cancelación |
| **Idempotencia de webhooks** | `pago_eventos.proveedorEventoId` único | Se extiende a la creación de reservas (§3.9) |
| **Unión discriminada** | `z.discriminatedUnion("tipo", ...)` en `campanas` y `diseno` | Valida el body de reserva según la vertical (§3.1) |

## 3. Patrones propuestos

### 3.1 Strategy + Registry de verticales → P1

**Qué:** un contrato común `VerticalReserva` y una implementación por vertical, resuelta por `tienda.tipoNegocio` desde un registro. Es el mismo diseño que `provider-factory.js`.

```js
// modules/reservas/verticales.js
const VERTICALES = { tours: toursVertical, hotel: hotelVertical, eventos: eventosVertical };
export function getVertical(tipoNegocio) { /* igual que getProvider */ }

// Contrato (JSDoc, como PaymentProvider)
{
  tipo: "tours",
  schemaSolicitud,                 // Zod: qué puede pedir el cliente
  reglas: [...],                   // §3.3
  cotizar(ctx, solicitud),         // §3.4 → { lineas, total, adelanto, politica }
  bloquear(tx, ctx, solicitud),    // §3.6 → filas bloqueadas + disponible
  retener(tx, ctx, pedido, sol),   // §3.5
  confirmar(tx, pedido),           // crea el documento operativo; devuelve eventos de dominio (§3.8)
  cancelar(tx, pedido, motivo)
}
```

**Por qué:** elimina el `switch` disperso. Agregar una vertical significa registrarla, sin tocar el flujo. Además, cada estrategia se testea aislada.

**Validación del body:** `z.discriminatedUnion("tipo", [solicitudTour, solicitudHotel, solicitudEvento])`, el mismo patrón de `campanas.schema.js`.

### 3.2 Template Method (por composición) → P1

**Qué:** el **esqueleto** de una reserva es idéntico en las tres verticales; solo cambian los pasos. En vez de herencia (`class HotelService extends ReservaBase`), un **orquestador** del núcleo recibe la estrategia:

```js
// modules/reservas/nucleo/crear-reserva.js
export async function crearReserva(ctx, solicitud) {
  const v = getVertical(ctx.tienda.tipoNegocio);
  const sol = v.schemaSolicitud.parse(solicitud);
  return prisma.$transaction(async (tx) => {
    const recursos = await v.bloquear(tx, ctx, sol);            // FOR UPDATE ordenado
    evaluarReglas(v.reglas, { ...ctx, sol, recursos });         // §3.3
    const cotizacion = v.cotizar({ ...ctx, recursos }, sol);    // §3.4, puro
    const pedido = await crearPedidoPorPagar(tx, ctx, cotizacion); // núcleo: cliente, cupón, comprobante
    await v.retener(tx, ctx, pedido, sol);                      // §3.5
    return pedido;
  });
}
```

**Por qué composición y no herencia:** el código del repo es funcional/modular (ES modules, funciones puras). La herencia acopla las verticales a una clase base frágil. Con composición, el núcleo (cliente, cupón, comprobante, pedido) se escribe **una vez**.

### 3.3 Specification / reglas componibles → P5

**Qué:** cada regla de negocio es una función pura `(ctx) => null | { codigo, mensaje }`, y cada vertical declara su lista.

```js
// tours/reglas.js
export const reglasTour = [
  salidaAbierta,          // estado IN (abierta, garantizada)
  dentroDelCorteDeVenta,  // fecha+hora − corte_venta_horas > ahora
  idiomaOfrecido,
  cupoSuficiente,
  edadMinimaCumplida,     // solo si ya hay fechas de nacimiento
  recojoEnZona
];
// hotel/reglas.js → minNoches, maxNoches, cerradoALlegada (CTA), cerradoASalida (CTD), anticipacion, capacidad
// eventos/reglas.js → ventanaDeVenta, minMaxPorCompra, codigoDeAccesoValido, aforoFuncion
```

**Por qué:** cada regla se testea sola con datos en memoria, y las reglas compartidas (`dentroDeVentana`, `cupoSuficiente`) se reutilizan entre verticales. Además, el **storefront usa las mismas reglas** para atenuar fechas no disponibles en el calendario, sin duplicar lógica.

**Variante:** `evaluarReglas` puede cortar en la primera falla (checkout) o acumularlas todas (vista de disponibilidad: "mínimo 3 noches · cerrado a llegadas").

### 3.4 Pipeline de modificadores de precio → P4

**Qué:** el precio es una **cadena de pasos puros**, y cada paso agrega su línea al desglose.

```js
const pipelineHotel = [
  precioBaseNoche,      // Chain of Responsibility: override del día → temporada → fin de semana → precio base (gana el primero)
  ajustePlanTarifa,
  recargoPersonaExtra,
  descuentoCupon,       // núcleo
  impuestos             // núcleo (exportación de servicios → IGV 0%)
];
// cotizar = pipeline.reduce((acc, paso) => paso(acc, ctx), cotizacionVacia)
```

- El **precio base de la noche** es una *Chain of Responsibility*: la primera fuente que responde gana.
- Los **ajustes** son un *pipeline*: todos se aplican en orden y quedan en `desglose`.
- **El mismo pipeline** sirve para mostrar el precio en el storefront, cotizar en el checkout y escribir el snapshot del pedido. Una sola fuente de verdad, como `cotizacion.js` con el envío.

### 3.5 Reservation / Lease (retención con vencimiento) → P3

**Qué:** el patrón *Reservation* (también llamado *Lease*): el recurso queda apartado **por un tiempo**, y si no se confirma, el apartado deja de contar **sin que nadie lo libere**.

- `retenciones_cupo.expira_en` + disponibilidad = total − confirmados − retenciones **vigentes**.
- **La corrección no depende de un proceso.** La limpieza (borrar vencidas, marcar pedidos `expirado`) es solo higiene. Esto importa porque el backend en Railway duerme.
- **Confirmación tardía** (el webhook llega después del vencimiento): se revalida y, si ya no hay cupo, el pedido pasa a `requiere_atencion`. Es un camino explícito del diseño, no un error.

### 3.6 Bloqueo pesimista ordenado (+ optimista donde corresponde) → P2

| Caso | Patrón | Por qué |
|---|---|---|
| Reservar / confirmar cupo | **Pessimistic Lock** (`SELECT ... FOR UPDATE`) con **orden global fijo** (función → tipos por id; noches por tipo y fecha) | Hay alta contención en lanzamientos y últimas plazas. Con bloqueo optimista habría reintentos en cascada |
| Edición del admin (grilla de tarifas, ficha del tour) | **Optimistic Lock** (`version INT` o `fecha_actualizacion` en el `WHERE`) | Poca contención (dos administradores editando lo mismo); no bloquea a los compradores |
| Defensa en profundidad | `CHECK (confirmados <= total)` en la BD | Si un bug salta la validación, la BD revierte en vez de sobrevender (como el `stock >= cantidad` actual) |

**Regla del repo:** toda transacción que bloquee más de un recurso lo hace en **un solo `SELECT` ordenado**, igual que `validarYBloquearStock`.

### 3.7 Repository específico + Query Object → P2, P11

`GenericRepository` sirve para el CRUD del admin (tours, tipos de habitación, guías). Las consultas de disponibilidad (agregados por rango, `HAVING COUNT(*) = noches`, uniones con retenciones vigentes) **no** caben en él. Por eso cada vertical tiene un repositorio de disponibilidad con SQL explícito:

```js
// hotel/disponibilidad.repository.js
buscarDisponibles(tiendaId, { entrada, salida })   // $queryRaw — filtra tienda_id explícito
bloquearNoches(tx, tiendaId, tipos, entrada, salida)
```

Un **Query Object** (`new BusquedaTours({ destino, fecha, pax, idioma })`) construye los filtros del listado del storefront sin concatenar SQL en el servicio.

### 3.8 Domain Events + Transactional Outbox → P7

**Qué:**
- `confirmar()` no envía correos: **devuelve eventos** (`ReservaConfirmada`, `SalidaGarantizada`, `EntradasEmitidas`).
- El núcleo los guarda en una tabla `eventos_salientes` **dentro de la misma transacción**. Después del commit, un despachador los procesa con los *handlers* suscritos (Observer): voucher por email, WhatsApp, recordatorio y exportación iCal.

```sql
CREATE TABLE eventos_salientes (
  id UUID PRIMARY KEY, tienda_id UUID, tipo VARCHAR(50), payload JSONB,
  estado VARCHAR(10) DEFAULT 'pendiente', intentos INT DEFAULT 0, proximo_intento TIMESTAMPTZ, error TEXT
);
```

**Por qué:**
- Si el email falla, la reserva **no** se revierte; el evento queda `pendiente` y se reintenta.
- Si el proceso muere justo después del commit, el evento sigue en la tabla. Railway puede dormir: el despachador corre después de cada commit y además con `pg_cron`.
- Agregar un efecto nuevo (por ejemplo, notificar al guía) es suscribir un handler, sin tocar `confirmar`.
- Los mismos eventos alimentan las tareas diferidas: los **recordatorios** son eventos con `proximo_intento = inicio − 24 h`.

**Alternativa más simple para el MVP:** un `EventEmitter` en memoria disparado tras el commit. No sobrevive a reinicios, así que se acepta solo si el voucher también puede reenviarse a mano desde el admin. **Recomendación:** outbox desde el inicio para `ReservaConfirmada`, porque el voucher es la promesa al cliente.

### 3.9 Idempotency Key → P9

- El storefront genera un `idempotency_key` (UUID) al **entrar** al paso de pago y lo manda en `POST /store/reservas`.
- Columna `pedidos.idempotency_key` con `UNIQUE (tienda_id, idempotency_key)`. Un reintento devuelve **el mismo pedido** en vez de crear otro.
- Los webhooks ya son idempotentes (`pago_eventos`). La confirmación manual del admin ("ya pagó por Yape") se protege con la transición de estado (§3.10): confirmar dos veces no pasa la máquina de estados.

### 3.10 Máquina de estados declarativa → P6

**Qué:** una tabla de transiciones por documento, no la versión GoF con una clase por estado (en JS eso es ceremonia sin beneficio).

```js
// tours/estados.js
export const maquinaReservaTour = {
  confirmada:   { abordar: "abordo", no_show: "no_show", cancelar: "cancelada", reprogramar: "reprogramada" },
  reprogramada: { abordar: "abordo", no_show: "no_show", cancelar: "cancelada" },
  abordo:       { completar: "completada" },
  // estados finales: completada, no_show, cancelada
};
// núcleo: transicionar(maquina, actual, accion) → nuevo | throw TransicionInvalida
```

- **Dos máquinas por reserva:** la **financiera** en `pedidos` (`por_pagar → confirmado → completado | cancelado | expirado | requiere_atencion`, común a todas) y la **operativa** en la tabla de cada vertical.
- Cada transición registra una fila en `pedido_historial_estados`, como hoy, y puede emitir un evento de dominio (§3.8).
- **Guards** opcionales por transición (por ejemplo, no se puede `abordar` antes del día de la salida).
- **Beneficio colateral:** corrige el hueco actual de `updateEstado`, que hoy acepta cualquier transición.

### 3.11 Policy object (reglas como datos) → reembolsos

`politicas_cancelacion.reglas` es **datos** (`[{horas_antes, reembolso_pct}]`) y `calcularReembolso(snapshot, inicio, ahora)` es su intérprete puro. El dueño crea políticas sin código, la política aplicada queda congelada en el pedido (*Snapshot*) y el cálculo se testea con tablas de casos.

### 3.12 Adapter (Ports & Adapters) → P8

| Puerto (contrato del dominio) | Adaptadores |
|---|---|
| `PaymentProvider` (ya existe) | Culqi; mañana Mercado Pago o Izipay |
| `CanalCalendario` → `importar(url): Bloqueo[]`, `exportar(reservas): string` | iCal genérico (Booking, Airbnb, Hostelworld usan el mismo formato); a futuro, la API de un channel manager |
| `Notificador` → `enviar(destinatario, plantilla, datos)` | Email (Resend), WhatsApp (link/plantillas actuales; API de WhatsApp Business a futuro) |
| `GeneradorDocumento` → `voucher(reserva)`, `manifiesto(salida)`, `entradaPdf(entrada)` | PDF |
| `FirmaQr` → `firmar(id)`, `verificar(token)` | HMAC (`nucleo/qr.js`) |

El dominio depende del puerto y nunca del formato de Booking o de Resend.

### 3.13 Command (con vista previa) → P10

Las operaciones masivas del admin son **comandos** explícitos con dos fases:

```js
const cmd = new ReprogramarSalida({ salidaId, salidaDestinoId, motivo });
await cmd.previsualizar();  // "32 pasajeros · 3 sin cupo en destino · 5 avisos por WhatsApp"
await cmd.ejecutar(user);   // en una transacción; emite eventos (avisos) y deja auditoría
```

Comandos previstos: `ReprogramarSalida`, `CancelarSalida`, `PostergarFuncion`, `CancelarEvento`, `EditarTarifasRango`, `BloquearHabitacion`, `EmitirCortesias`.

**Escáner offline:** cada lectura es un comando `RegistrarEscaneo` guardado en una **cola local** (IndexedDB) que se sincroniza al recuperar señal. El servidor lo procesa de forma idempotente (por id del escaneo).

### 3.14 Materialización perezosa (expansión de recurrencias) → P11

- `tour_programaciones` es una **regla** ("lun-sáb 04:30"); `tour_salidas` es su **expansión**. Las salidas se crean al consultar o reservar una fecha (`INSERT ... ON CONFLICT DO NOTHING`), y opcionalmente en lote al guardar la regla.
- Lo mismo vale para `hotel_disponibilidad` respecto de `hotel_tipos_habitacion`.
- Es el mismo principio que §3.5: **la corrección no depende de un cron**.
- Se evaluó guardar la regla en formato RRULE (RFC 5545). Para el MVP alcanza con `dias_semana[] + hora + vigencia`; RRULE recién si aparecen reglas tipo "primer sábado del mes".

### 3.15 Abstract Factory / módulo-plugin de vertical → P1, P12

Cada vertical se empaqueta como un **módulo autocontenido** que el núcleo descubre. Es una *arquitectura microkernel*: el núcleo es estable y las verticales son plugins.

```js
// modules/reservas/tours/index.js
export default {
  tipo: "tours",
  estrategia,            // §3.1
  rutasAdmin, rutasStore,
  seedConfig,            // inserta config_tours al crear la tienda (como metodos-pago-seed)
  modelosTenant: ["tours", "tour_salidas", ...], // se suman a TENANT_SCOPED_MODELS
  handlers,              // suscripciones a eventos de dominio (§3.8)
  herramientasAgente     // tools del agente IA (consultar_salidas)
};
```

`routes/index.js` monta solo los módulos registrados, y el onboarding llama a `seedConfig` según el tipo elegido.

## 4. Frontend (Angular, SSR, signals)

| Problema | Patrón | Aplicación |
|---|---|---|
| Pantallas distintas por vertical | **Lazy routes por vertical** + resolución por `tipoNegocio` | `store.routes.ts` carga `features/verticales/<tipo>/routes`; el bundle de hoteles no se descarga en una tienda de tours |
| Servicios distintos con la misma interfaz | **Strategy vía DI**: `InjectionToken<ReservaApi>` provisto en los `providers` de la ruta de cada vertical | Los componentes compartidos (resumen, pago, "Mis reservas") inyectan el token sin saber la vertical |
| Checkout de 2.145 líneas | **Wizard + registro de pasos** (composición dinámica con `NgComponentOutlet`) | El núcleo arma *contacto → [paso de la vertical] → comprobante → pago*; cada vertical registra su componente de logística |
| Estado del flujo de reserva | **Facade + store de signals** (como `cart.state.ts`) | `ReservaTourStore`: salida elegida, pasajeros, extras, cotización (`computed`), retención y vencimiento |
| DTO del backend ≠ modelo de pantalla | **Adapter / mapper** | `toSalidaVM()` formatea fechas en la zona horaria de la tienda, "quedan N" y estado garantizada |
| Contador de la retención | **Timer fuera de la zona de Angular** tras `afterNextRender` | Evita el problema conocido de estabilidad y scroll del router con timers en la zona |
| Admin: menú y pantallas por vertical | El mismo registro de módulos (§3.15) del lado del admin | El menú se arma con lo que declara la vertical activa |

## 5. Patrones evaluados y descartados

| Patrón | Por qué no (por ahora) |
|---|---|
| **Herencia por vertical** (`HotelPedido extends Pedido`) | Jerarquías frágiles; el repo es funcional y modular. Se usa composición (§3.2) |
| **`switch (tipoNegocio)` disperso** | Es el antipatrón que §3.1 y §3.15 evitan (*shotgun surgery*) |
| **EAV / configuración genérica clave-valor** para reglas de negocio | Sin tipos ni defaults en la BD, y se consulta en cada reserva. Va en `config_<vertical>` tipada |
| **Event Sourcing** | Reconstruir estado desde eventos es un costo enorme para el beneficio. El historial de estados más el outbox cubren la auditoría |
| **CQRS completo** (modelos y BD separados de lectura y escritura) | El volumen no lo justifica. Basta con separar las *consultas* de disponibilidad en repositorios propios (§3.7) |
| **Microservicios / Saga distribuida** | Un monolito modular con transacciones de Postgres da consistencia fuerte gratis. La única "saga" (pago externo → confirmar) ya está cubierta por §3.5 + §3.9 |
| **State de GoF** (una clase por estado) | Mucha ceremonia en JS. La tabla de transiciones (§3.10) es más legible y testeable |
| **Bloqueo optimista para el cupo** | Con contención alta (preventa) genera reintentos en cascada. Se usa solo en ediciones del admin (§3.6) |
| **Liberar retenciones con un cron como fuente de verdad** | Railway duerme; se usa vencimiento calculado (§3.5) |
| **XState u otra librería de máquinas de estado en el backend** | Las máquinas tienen 5-7 estados; un objeto plano alcanza. Se puede reconsiderar si aparecen estados jerárquicos |

## 6. Mapa de flujo: cómo encajan

```
POST /store/reservas  (idempotency_key §3.9)
  └─ crearReserva()  — Template Method por composición §3.2
       ├─ getVertical(tipoNegocio)            Strategy + Registry §3.1 / plugin §3.15
       ├─ schemaSolicitud.parse               discriminatedUnion (Zod)
       └─ $transaction  (Unit of Work)
            ├─ v.bloquear()   FOR UPDATE ordenado §3.6 · repositorio específico §3.7 · materialización §3.14
            ├─ evaluarReglas(v.reglas)        Specification §3.3
            ├─ v.cotizar()    pipeline puro §3.4 → snapshot
            ├─ crearPedidoPorPagar()          núcleo (cliente, cupón, comprobante) · máquina financiera §3.10
            └─ v.retener()    Lease §3.5

Webhook Culqi / confirmación manual
  └─ $transaction
       ├─ transicionar(por_pagar → confirmado)   §3.10
       ├─ v.confirmar() → eventos de dominio     §3.8
       └─ INSERT eventos_salientes (outbox)
  └─ despachador → handlers: voucher (GeneradorDocumento), Notificador, iCal   Adapter §3.12

Admin: ReprogramarSalida.previsualizar() / ejecutar()                          Command §3.13
```

## 7. Prioridad para el MVP de tours

| Imprescindible desde el día 1 | Puede llegar después |
|---|---|
| Strategy + Registry (§3.1), Template por composición (§3.2) | Query Object para la búsqueda avanzada (§3.7) |
| Reglas componibles (§3.3) y pipeline de precio (§3.4) | Comandos con vista previa (§3.13). El MVP puede ejecutar sin vista previa |
| Lease (§3.5) + bloqueo pesimista ordenado (§3.6) | Optimistic lock en el admin (§3.6) |
| Máquina de estados (§3.10) | Puerto `CanalCalendario` (solo hotel) |
| Outbox para `ReservaConfirmada` (§3.8) | Plugin completo con autodescubrimiento (§3.15). Al inicio, un registro manual basta |
| Idempotency key (§3.9) | Cola offline del escáner (§3.13) |
| Wizard del checkout con registro de pasos (§4) | |

## 8. Riesgos a vigilar al implementar

- **`$queryRaw` y el scope de tenant:** la extensión de Prisma no protege SQL crudo, y el diseño usa mucho SQL crudo (bloqueos, disponibilidad). Hace falta un helper que obligue a pasar `tiendaId` y tests que lo verifiquen.
- **Zona horaria:** las reglas de corte de venta y la noche de check-in se calculan en `tiendas.zona_horaria`, nunca en la hora del servidor (Railway corre en UTC). Hay que centralizarlo en un helper de fechas del núcleo.
- **Orden de los bloqueos entre verticales y el outbox:** el despachador nunca debe tomar locks de cupo; solo lee eventos.
- **Tamaño de las transacciones:** la generación de PDF, el envío de correos y las llamadas HTTP van **fuera** de la transacción (por eso existe el outbox).
