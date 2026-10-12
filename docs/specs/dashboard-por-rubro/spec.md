# Spec: dashboard del admin por rubro

> Estado: **implementado** (2026-10-12, BackendNode y FrontendAdmin; tests y build OK, probado contra la base con una tienda de cada rubro). Pendiente: 3.1 (verificación en el navegador) y el saldo de minutos de transmisión (espera a que termine transmision-eventos). Tareas: al final.
> Origen: el dashboard del admin se hizo para la tienda de productos y quedó igual al llegar hotel, tours, eventos, locales y canchas. Maquetas aprobadas: https://claude.ai/artifact/21v34bNa5RVRKwNWj9X1jz
> Base: [perfil-negocio](../perfil-negocio/spec.md) (Strategy por rubro: contrato y registro).
> Repos: BackendNode (datos y reglas) y FrontendAdmin (pinta los widgets).

## Problema

El dashboard anterior mostraba siete totales históricos (`GET /admin/tiendas/:id/stats`) y una tabla de últimos pedidos (`GET /admin/pedidos/resumen`):

| Dónde | Problema |
|---|---|
| `getTiendaStats` · ventas | **Bug.** Suma todo pedido que no esté `cancelado`. Las reservas guardan su estado en `pedidos.estado`, así que entran las `solicitada`, `rechazada` y `vencida` que nunca se pagaron. |
| `getTiendaStats` · pendientes | **Bug.** Cuenta `estado = 'pendiente'`, que las reservas no usan: en los rubros de reservas siempre es 0. |
| `findResumen` | **Bug.** No filtra por `tipo`: mezcla reservas con compras y muestra su estado crudo. |
| Tarjetas y accesos | Fijos para productos (Categorías, Productos, Pedidos). El hotel no tiene Categorías ni Pedidos en su menú; las canchas no tienen Categorías. |
| Cifras | Todo es acumulado histórico, sin periodo ni comparación. |
| Atención | No usa `/reservas/resumen`, que ya tiene lo urgente (solicitudes, pagos por verificar, cuotas vencidas). |
| Hotel | Lo cobrado en el mostrador (`hotel_cobros`) no cuenta como ingreso. |

## Decisiones (2026-10-12)

1. **Periodo:** últimos 30 días móviles, comparados con los 30 días anteriores. Sin selector en esta fase.
2. **Los widgets los decide el backend** según el rubro de la tienda (leído de la BD con `tiendaDe`). El front solo los pinta.
3. **Montos por rol:** el rol `viewer` recibe solo cantidades. `editor`, `admin` y `owner` reciben también los montos.
4. **Canchas:** sin «Turnos fijos activos». El fijo semanal no se guarda como tal (cada semana es una reserva suelta; ver alquiler-canchas). Lo reemplaza «Clientes que repiten». Vuelve cuando exista el fijo semanal.
5. **Hotel sin habitaciones físicas** (sin Recepción): no hay mapa de habitaciones; la ocupación sale de `hotel_tipos_habitacion.unidades`.

## Patrón

**Strategy por rubro que compone widgets.** Se extiende la Strategy de `perfil-negocio`; no se agrega un patrón nuevo.

| Parte | Patrón | Dónde |
|---|---|---|
| Cada rubro tiene su dashboard | Strategy: `estrategiaDe(tienda).dashboard` | `negocio/registro.js` |
| El dashboard se arma con piezas reutilizables | Composición declarativa: la estrategia es una **lista de widgets**, cada widget una función `(ctx) => Promise<Widget \| null>` | `negocio/<rubro>/dashboard.js` |
| Montos por rol y comparación de periodos | Filtro único (`sinMontos`) y función de orden superior (`conAnterior`), aplicados en el servicio común | `modules/dashboard/` |
| El front pinta cada widget | Factory con registro tipado `Record<TipoWidget, Componente>` | FrontendAdmin `dashboard/` |

Descartados:

- **Template Method** (clase base con `atencion()`, `hoy()`, `periodo()`, `proximo()`): obliga a todos los rubros a tener las cuatro franjas; tours y eventos no tienen «Hoy». El proyecto usa objetos, no clases.
- **Un endpoint por rubro:** el front tendría que preguntar por la identidad del rubro.
- **El front decide los widgets:** la regla de montos por rol quedaría en el cliente.

## Diseño (BackendNode)

```
modules/dashboard/
  dashboard.routes.js     ← GET /admin/tiendas/:tiendaId/dashboard
  dashboard.service.js    ← armarDashboard(tienda, { rol, ahora }): no sabe de rubros
  periodo.js              ← ultimos30(ahora), conAnterior
  montos.js               ← sinMontos(widgets), verMontos(rol)
  widgets.js              ← TIPOS_WIDGET y constructores (kpi, widget)
  piezas/                 ← widgets compartidos: atencion, cobros, …
negocio/<rubro>/dashboard.js        ← la lista del rubro (solo declara)
reservas/<rubro>/dashboard.js       ← widgets propios de la vertical (consultas del rubro)
```

### Respuesta

```json
{
  "periodo": { "desde": "2026-09-12T…", "hasta": "2026-10-12T…", "dias": 30 },
  "montos": true,
  "widgets": [
    { "tipo": "atencion", "id": "atencion", "items": [ { "clave": "por_responder", "etiqueta": "Solicitudes por responder", "n": 2, "tono": "warn", "ruta": "/reservas" } ] },
    { "tipo": "kpis", "id": "hoy", "titulo": "Hoy", "items": [ { "clave": "ocupacion_noche", "etiqueta": "Ocupación esta noche", "valor": 75, "formato": "pct", "detalle": "12 de 16 habitaciones" } ] },
    { "tipo": "barras", "id": "ocupacion_14", "titulo": "Ocupación · próximos 14 días", "formato": "pct", "max": 100, "serie": [ { "etiqueta": "lun 12", "valor": 92 } ] }
  ]
}
```

Campos comunes de un widget: `tipo`, `id` (único en el dashboard), `titulo?`, `subtitulo?`, `ruta?` (link «Ver…» del admin), `ancho` (`completo` | `ancho` | `medio` | `angosto`).

Formatos de valor: `PEN`, `num`, `pct`, `horas`, `texto`.

Tipos (`TIPOS_WIDGET`):

| tipo | Contenido |
|---|---|
| `atencion` | `items: [{ clave, etiqueta, n, tono: crit\|warn\|info, ruta }]`. Solo los que tienen `n > 0`. |
| `kpis` | `items: [{ clave, etiqueta, valor, formato, anterior?, detalle?, destacado?, invertido? }]`. `anterior` = mismo indicador en los 30 días previos (el front calcula la variación; en `pct`, en puntos). `invertido`: menos es mejor (tiempo de respuesta). |
| `barras` | `serie: [{ etiqueta, valor }]`, `formato`, `max?`. Una serie, sin leyenda. |
| `ranking` | `items: [{ nombre, valor, monto? }]`, `unidad`. |
| `lista` | `items: [{ cuando, titulo, detalle, estado?: { tono, texto }, monto?, ruta? }]`, `vacio`. |
| `habitaciones` | `items: [{ numero, tipo, estado: libre\|ocupada\|por_vencer\|vencida\|por_limpiar\|mantenimiento, detalle? }]`. |
| `funciones` | `items: [{ nombre, inicio, cupo, vendidas, apartadas, tipos: [{ nombre, vendidas, cupo }] }]`, `vacio`. |
| `calendario` | `mes: "YYYY-MM"`, `hoy`, `dias: [{ fecha, eventos: [{ texto, estado: confirmada\|solicitada }] }]`. |
| `embudo` | `pasos: [{ etiqueta, valor }]`. |
| `agenda` | `apertura`, `cierre`, `ahora: "HH:mm"`, `filas: [{ nombre, detalle, bloques: [{ desde, hasta, tipo: reserva\|apartado\|bloqueo, texto }] }]`. |
| `mapa_calor` | `filas` (días), `columnas` (horas), `valores` (0–1, filas × columnas). |

## Requisitos

- **DR1** `GET /admin/tiendas/:tiendaId/dashboard` (rol mínimo `viewer`) responde `{ periodo, montos, widgets }`. El rubro sale de `tiendaDe(tiendaId)`, nunca del request. Reemplaza a `GET /admin/tiendas/:tiendaId/stats`, que se elimina con `getTiendaStats`.
- **DR2** `dashboard` entra en `CONTRATO`: arreglo no vacío de funciones. El test de contrato falla si un rubro no lo define.
- **DR3** `armarDashboard` corre los widgets del rubro en paralelo, descarta los `null` (un widget que no aplica, como el mapa de habitaciones sin Recepción) y aplica `sinMontos` si el rol no ve montos. Ningún widget pregunta por el rol.
- **DR4** `sinMontos` quita: los widgets con `formato: "PEN"`, los ítems de `kpis` con `formato: "PEN"` (y el widget si queda vacío) y toda clave `monto`. Un test recorre **todos** los rubros con rol `viewer` y comprueba que no queda ningún `PEN` ni `monto`.
- **DR5** Todo widget devuelto tiene un `tipo` de `TIPOS_WIDGET` y un `id` único. Lo comprueba un test que recorre todos los rubros.
- **DR6** **Ingresos = lo cobrado**, por fecha de cobro:
  - Rubros de reservas: `pagos` con `estado = 'pagado'` (pasarela y verificación manual; fecha = `fecha_actualizacion`, o `fecha_registro` si no tiene). El hotel suma `hotel_cobros` (mostrador).
  - Productos: se mantiene el criterio de hoy, pero solo con compras: `pedidos.tipo = 'compra'`, `estado <> 'cancelado'`, por `fecha_registro`.
- **DR7** Los últimos pedidos salen del widget de productos (solo compras). `GET /admin/pedidos/resumen` y `findResumen`, que solo usaba el dashboard anterior, se eliminan.
- **DR8** Las fechas «hoy» y los días de las series se cuentan en hora de Lima (`reservas/tiempo.js`).
- **DR9** FrontendAdmin: `Widget` es una unión por `tipo` y `DashboardComponent` pinta cada uno con un registro `Record<TipoWidget, Type>`. Un tipo sin componente no compila. El dashboard no consulta el rubro.

## Widgets por rubro

«Nueva» = consulta nueva; lo demás reusa un servicio que ya existe.

**Productos**
- Atención: pedidos por confirmar (`estado = pendiente`), por despachar (`en_proceso`), stock bajo (producto o variante activa con `stock ≤ productos.stock_alerta`, sin servicios).
- Periodo: ventas (PEN), pedidos, ticket promedio (PEN), clientes nuevos.
- Ventas por día (PEN), más vendidos (`pedido_detalles`), últimos pedidos (compras), stock bajo.

**Hotel**
- Atención: solicitudes por responder, pagos por verificar (`resumenReservas`), habitaciones por limpiar, estadías vencidas sin cerrar.
- Hoy: ocupación de esta noche (`ocupacion()` sobre `unidades`), llegadas, salidas, en casa.
- Mapa de habitaciones (`tablero()` de Recepción; `null` sin habitaciones físicas). Llegadas de hoy.
- Periodo: ingresos (web + mostrador, PEN), noches vendidas, ocupación promedio, tarifa promedio por noche (PEN).
- Ocupación de los próximos 14 días (`ocupacion()`).

**Tours**
- Atención: por responder, pagos por verificar, salidas en menos de 24 h sin confirmar.
- Periodo: ingresos (PEN), pasajeros, tasa de aceptación, tiempo de respuesta (mediana de `respondida_en − fecha_registro`).
- Próximas salidas (hoy y mañana, por tour y hora), tours más vendidos (pasajeros), pasajeros por día de los próximos 14 días.

**Eventos**
- Atención: pagos por verificar, compras apartadas sin pagar (`por_pagar` vigentes).
- Periodo: entradas vendidas, ingresos (PEN), vendidas hoy, ingreso por entrada (PEN).
- Próximas funciones (vendido / apartado / libre por tipo de entrada), entradas vendidas por día.
- Pendiente: saldo de minutos de transmisión (plan, paquetes y excedente). Se agrega **cuando se complete el desarrollo de [transmision-eventos](../transmision-eventos/spec.md)**: hoy esa spec está sin implementar y el cálculo del saldo puede cambiar.

**Locales**
- Atención: por responder, pagos por verificar, cuotas vencidas, garantías por devolver (`wherePestana`), cotizaciones que vencen en 48 h.
- Periodo: cobrado (PEN), por cobrar (cuotas pendientes de reservas vigentes, PEN), eventos de los próximos 30 días, conversión de cotizaciones.
- Calendario del mes (todos los salones), embudo cotización → solicitud → confirmada, canal de origen, cuotas que vencen en 7 días.

**Canchas**
- Atención: adelantos por verificar, apartados esperando adelanto, bloqueos de hoy.
- Hoy: ocupación (horas reservadas ÷ horas abiertas), ingresos de hoy (PEN), próximo turno, horas libres desde las 18:00.
- Agenda de hoy (`agendaAdmin()`).
- Periodo: ingresos (PEN), ocupación, horas vendidas, clientes que repiten.
- Ocupación por día de la semana y hora (4 semanas).

## Riesgos

- **Más consultas:** `/stats` era una sola query; un dashboard son 6–12 en paralelo. Si pesa en la prueba de carga, caché de 60 s por tienda y rol en `armarDashboard`, sin tocar los widgets.
- **Definición de ingresos:** cambia la cifra de los rubros de reservas (deja de estar inflada). En productos no cambia el criterio.
- **Payload compartido entre repos:** el backend es la fuente de `TIPOS_WIDGET`; el front la replica en su unión. Un tipo nuevo exige tocar ambos.

## Tareas

- [x] 1.1 Núcleo backend: `modules/dashboard/` (`widgets.js` con `TIPOS_WIDGET`, `periodo.js`, `montos.js`, `dashboard.service.js` con `ctx.memo`), ruta en `tiendas.admin.routes.js` y `dashboard` en el contrato (`faltantesDelContrato`).
- [x] 1.2 Piezas compartidas: `contarPestana` en reservas.service (misma regla que la bandeja), `piezas/reservas.js` (avisos e ingresos) y `piezas/cobros.js` (DR6).
- [x] 1.3 Widgets de los seis rubros: `negocio/<rubro>/dashboard.js` (solo la lista) y `reservas/<rubro>/dashboard.js` (consultas). Productos tiene las suyas en `negocio/productos/dashboard.js`.
- [x] 1.4 Quitados `/stats`, `getTiendaStats`, `/pedidos/resumen` y `findResumen`; `load-tests` pide `/dashboard`.
- [x] 1.5 Tests (`modules/dashboard/__tests__`): periodo, `sinMontos`, los seis rubros con owner y viewer (tipos, ids, sin `PEN`, `monto` ni «S/»), ingresos de compras y de reservas. Contrato: falta `dashboard`. Backend: 82 suites, 1120 tests OK.
- [x] 2.1 FrontendAdmin: `models/dashboard.model.ts`, `DashboardService.getDashboard`, `dashboard/widgets/*` (un componente por tipo y `registro.ts`), `dashboard/formato.ts` con su spec. Admin: build OK, 70 tests OK.
- [x] 2.2 FrontendAdmin: fuera el dashboard viejo (tarjetas fijas, accesos rápidos, `getStats`, CSS sin uso). La lista de pedidos lee `?estado=` y la bandeja de reservas `?pestana=` (los avisos abren la vista filtrada).
- [ ] 3.1 Verificación en el navegador por rubro (zapatillas, demobooking, tour-test, evento-test, casa-alborada y los-cedros), con un usuario owner y uno viewer.
- [x] 3.2 `CLAUDE.md` (BackendNode y FrontendAdmin): una línea sobre el dashboard por rubro.
- [ ] 4.1 Eventos: widget de saldo de minutos de transmisión. **Bloqueada:** se hace al completar transmision-eventos, reusando su cálculo de saldo (no uno propio del dashboard).

## Decisiones tomadas al implementar (2026-10-12)

- **Corrección del diagnóstico:** el «bug» de la columna Cliente no existía (`findResumen` ya convertía `clienteNombre` en `cliente.nombre`). Se quitó de la tabla del problema.
- **Atribución por fecha:** ventas de productos por fecha del pedido; ingresos de reservas por fecha de verificación del pago; entradas por `fecha_confirmado`; pasajeros y ranking de tours por fecha de la reserva; noches del hotel por noche ocupada (con `completada`, que `ocupacion()` no cuenta) y tarifa por noche según la fecha de llegada.
- **Tests acoplados al registro:** el registro ahora carga los dashboards, así que los tests que reemplazan módulos completos por mocks parciales deben exportar también lo que usan los dashboards (`reservas.service.test` y `agente.eventos.test`: `ocupacion`, `nochesDe`, `unidadesDe`, `apartadasPorTipo`, `moverVendidos`). Es el mismo acople que ya tenían con las verticales.
- **Prueba contra la base** (solo lectura, `armarDashboard` con rol owner): zapatillas 0.3 s, tour-test 0.5 s, evento-test 0.8 s, los-cedros 1.0 s, casa-alborada 1.3 s, demobooking 1.5 s. Sin errores de SQL en ningún rubro.
