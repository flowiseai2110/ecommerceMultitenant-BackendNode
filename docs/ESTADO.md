# Tablero del proyecto

> Una fila por funcionalidad abierta. Lo actualiza cada agente al terminar su etapa (ver [proceso](proceso/README.md)).
> **Te toca** = lo que solo tú puedes hacer (aprobar, correr SQL, poner llaves, probar en el navegador).

## En curso

| Funcionalidad | Spec | Etapa | Te toca | Actualizado |
|---|---|---|---|---|
| Multi-sede | [spec](specs/multi-sede/spec.md) | aprobado · pieza 1 sin empezar | Antes de la pieza 1: cerrar lo pendiente de reservas (tabla de abajo) | 2026-10-18 |
| Antipatrones | [spec](specs/antipatrones/spec.md) | en desarrollo (piezas 1-2 hechas; pieza 4: desarrollo completo, falta verificar) | Avisar cuando termine precio-en-servidor (hoy el checkout no compila por su cambio) → verificar pieza 4 (e2e + mock de cotizar, npm test, build) · probar en navegador #2, #3 y el checkout (mapa/GPS a mano) · al desplegar, correr `antipatrones_claves_tildes.sql` en Supabase | 2026-10-20 |
| Campañas: el cuándo (ventana de uso, fechas por año, horas; Fase 2: repetición y descuento) | [spec](specs/campanas-cuando/spec.md) · [diseño](specs/campanas-cuando/diseno.md) · [prototipo](disenos/campanas-cuando/v1-2026-10-19.html) · [impacto](specs/campanas-cuando/impacto.md) · [tareas](specs/campanas-cuando/tasks.md) | programado completo (1a–3b + "Mis fechas" R2.9 + validaciones R8), sin probar en navegador | Diego: correr `docs/sql/campanas_ediciones.sql` en Supabase y `npx prisma generate`; probar al final del requerimiento la lista única de `cambios.md` (piezas 1a a 3b; 3a/3b: fechas de uso en Campañas, línea en la portada y rombos en los selectores); (pieza 2: cargar una edición en `/campanas-plataforma`, ver el Cyber Wow en Campañas, Black Friday/Cyber Monday el 30 nov) y 1b (Safari, hora frontera); luego QA de pieza 2. Esta Fase 1 va antes que multi-sede | 2026-10-20 |
| Precio y descuento calculados en el servidor (productos) — **bug crítico de seguridad** | [ADR-0001](adr/ADR-0001-precio-calculado-en-servidor.md) · [impacto](specs/precio-en-servidor/impacto.md) · [tareas](specs/precio-en-servidor/tasks.md) · [cambios](specs/precio-en-servidor/cambios.md) · origen: [campanas-cuando](specs/campanas-cuando/spec.md) (Q5, P-b) | en desarrollo (piezas 1-4 listas, sin commit; sin QA ni navegador por pedido de Diego) | Te toca: revisar / pasar a QA las piezas 1-4 y pedir commit. Pendiente: actualizar el e2e `e2e/checkout/` (body sin montos, mock de `/cotizar`, caso 409). Al desplegar: SQL `docs/sql/precio_en_servidor.sql` en Supabase **antes** del backend (y revisar la consulta de cupones > 100 %); llave opcional `RATE_LIMIT_COTIZAR_MAX`; backend antes que la Tienda | 2026-10-20 |
| Campañas: rediseño en 3 pasos y promoción de precios (productos) — es el R5 de campanas-cuando | [spec](specs/campanas-descuento/spec.md) · [diseño](specs/campanas-descuento/diseno.md) · [prototipo](disenos/campanas-descuento/v1-2026-10-20.html) · [ADR-0001](adr/ADR-0001-precio-calculado-en-servidor.md) · [ADR-0002](adr/ADR-0002-campana-en-tres-pasos.md) · [impacto](specs/campanas-descuento/impacto.md) · [tareas](specs/campanas-descuento/tasks.md) | planificado (8 piezas: C1, C2 ya; C3a en adelante tras precio-en-servidor P1–P3 en producción; C6 tras P4; C4 Admin al final) | Aprobar el plan y las decisiones E1–E10 de impacto.md. Antes de C1: commit de campanas-cuando. Al desplegar C2: correr `campanas_descuento_historial.sql` en Supabase | 2026-10-20 |
| Límites de uso por tienda (que una tienda no afecte a las demás: ritmo, cuota de IA, tope simultáneo a la IA) | [spec](specs/limites-por-tienda/spec.md) | borrador | Aprobar la spec y responder P1-P7 y P9 (valores por defecto: medir uso real primero). La cuota mensual por tienda ya existe (`consumo-ia`); la spec la extiende | 2026-10-19 |

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
