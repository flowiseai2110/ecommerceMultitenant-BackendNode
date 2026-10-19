# Tablero del proyecto

> Una fila por funcionalidad abierta. Lo actualiza cada agente al terminar su etapa (ver [proceso](proceso/README.md)).
> **Te toca** = lo que solo tú puedes hacer (aprobar, correr SQL, poner llaves, probar en el navegador).

## En curso

| Funcionalidad | Spec | Etapa | Te toca | Actualizado |
|---|---|---|---|---|
| Multi-sede | [spec](specs/multi-sede/spec.md) | aprobado · pieza 1 sin empezar | Antes de la pieza 1: cerrar lo pendiente de reservas (tabla de abajo) | 2026-10-18 |
| Antipatrones | [spec](specs/antipatrones/spec.md) | en desarrollo (piezas 1-2 hechas; pieza 4 · tarea 1, hallazgos del e2e, A5.1 y A5.2 listos) | Probar en navegador #2 y #3 · revisar A5.2 (`CheckoutStore`) y pasar a A5.3 · decidir si el store (887 líneas) se parte para la meta de 400 líneas · al desplegar, correr `antipatrones_claves_tildes.sql` en Supabase | 2026-10-19 |
| Campañas: el cuándo (ventana de uso, fechas por año, horas; Fase 2: repetición y descuento) | [spec](specs/campanas-cuando/spec.md) · [diseño](specs/campanas-cuando/diseno.md) · [prototipo](disenos/campanas-cuando/v1-2026-10-19.html) | diseñado (Fase 1) | Aprobar el diseño: decisiones A–I y propuestas P1–P8 al final de `diseno.md` | 2026-10-19 |
| Precio y descuento calculados en el servidor (productos) — **bug crítico de seguridad** | [spec](specs/campanas-cuando/spec.md) (Q5, P-b) | sin empezar · falta spec propia | Decidir cuándo se aborda (va antes que cualquier descuento) | 2026-10-19 |

## Pendiente heredado (por verificar)

> Sale de la memoria de sesiones anteriores, no de los repos. Los tres repos están sin cambios pendientes
> al 2026-10-18, así que lo de "sin commit" probablemente ya está commiteado. Falta confirmar SQL, llaves y pruebas.
> Pídele al `ecommerce-proceso:deployer` que lo verifique: *"verifica el pendiente heredado de ESTADO.md"*.

| Funcionalidad | Spec | Pendiente según memoria |
|---|---|---|
| Motor de reservas del hotel (M1 bandeja, M2 cupo) | [spec](specs/motor-reservas-hotel/) | SQL `cupo_externo` en Supabase; probar en navegador |
| Ciclo de la reserva del hotel | [spec](specs/ciclo-reserva-hotel/) | Probar Admin en navegador; pieza 4 (tienda) |
| Mejoras de la reserva del hotel | [spec](specs/reserva-hotel-mejoras/) | Probar; pieza 3 pospuesta |
| Ocupación en buscador del hotel | — | Probar en navegador |
| Paquetes del hotel | [spec](specs/paquetes-hotel/) | Spec en borrador: aprobar; prototipo |
| Hospedaje completo | [spec](specs/hospedaje-completo/) | Verificar Admin |
| Alquiler de canchas | [spec](specs/alquiler-canchas/) | Deploy |
| Editor de Diseño en vivo | [spec](specs/editor-diseno-en-vivo/) | Pase a producción |
| Layout por rubro | [spec](specs/layout-por-rubro/) | Probar editor de Diseño del admin |
| Libro de Reclamaciones | [spec](specs/libro-reclamaciones/) | SQL en Supabase; secrets `LIBRO_*` en Railway |
| Checkout envío/pago/comprobante | [spec](specs/checkout-envio-pago/) | SQL antes de desplegar |
| Accesibilidad | [spec](specs/accesibilidad/) | Auditoría axe/Lighthouse con el sitio publicado |
| Plantillas por rubro | [spec](specs/plantillas-por-rubro/) | Mapeo pantalla por pantalla |
| Tienda en SSR | [spec](specs/tienda-en-ssr/) | En pausa (deuda) |

## Desplegado

| Funcionalidad | Fecha | Tag |
|---|---|---|
