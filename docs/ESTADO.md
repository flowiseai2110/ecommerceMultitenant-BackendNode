# Tablero del proyecto

> Una fila por funcionalidad abierta. Lo actualiza cada agente al terminar su etapa (ver [proceso](proceso/README.md)).
> **Te toca** = lo que solo tú puedes hacer (aprobar, correr SQL, poner llaves, probar en el navegador).

## En curso

| Funcionalidad | Spec | Etapa | Te toca | Actualizado |
|---|---|---|---|---|
| Multi-sede | [spec](specs/multi-sede/spec.md) | aprobado · pieza 1 sin empezar | Antes de la pieza 1: cerrar lo pendiente de reservas (tabla de abajo) | 2026-10-18 |
| Antipatrones | [spec](specs/antipatrones/spec.md) | en desarrollo (piezas 1-2 hechas) | Probar en navegador #2 y #3 | 2026-10-18 |

## Pendiente heredado (por verificar)

> Sale de la memoria de sesiones anteriores, no de los repos. Los tres repos están sin cambios pendientes
> al 2026-10-18, así que lo de "sin commit" probablemente ya está commiteado. Falta confirmar SQL, llaves y pruebas.
> Pídele al `deployer` que lo verifique: *"@agente-deployer verifica el pendiente heredado de ESTADO.md"*.

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
