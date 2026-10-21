# Tablero del proyecto

> Una fila por funcionalidad abierta. Lo actualiza cada agente al terminar su etapa (ver [proceso](proceso/README.md)).
> **Te toca** = lo que solo tú puedes hacer (aprobar, correr SQL, poner llaves, probar en el navegador).

## En curso

| Funcionalidad | Spec | Etapa | Te toca | Actualizado |
|---|---|---|---|---|
| Multi-sede | [spec](specs/multi-sede/spec.md) | aprobado · pieza 1 sin empezar | Antes de la pieza 1: cerrar lo pendiente de reservas (tabla de abajo) | 2026-10-18 |
| Antipatrones | [spec](specs/antipatrones/spec.md) | en desarrollo (piezas 1-2 hechas; pieza 4 lista: e2e 12/12, Karma 340, build OK; pieza 5 lista: backend 137 suites / 2149, cierra un agujero de aislamiento en variantes e imágenes) | Revisar / pasar a QA la pieza 5 y probarla en el Admin según #6 · commit de la pieza 5 (después o junto con campañas-descuento: comparten `producto-variantes.admin.routes.js`) y desplegarla pronto · probar en navegador #2, #3 y el checkout de la pieza 4, con el mapa y el GPS a mano · commit del e2e y los docs del cierre · al desplegar, correr `antipatrones_claves_tildes.sql` en Supabase · siguiente: pieza 6 | 2026-10-20 |
| Campañas: el cuándo (ventana de uso, fechas por año, horas; Fase 2: repetición y descuento) | [spec](specs/campanas-cuando/spec.md) · [diseño](specs/campanas-cuando/diseno.md) · [prototipo](disenos/campanas-cuando/v1-2026-10-19.html) · [impacto](specs/campanas-cuando/impacto.md) · [tareas](specs/campanas-cuando/tasks.md) | programado completo (1a–3b + "Mis fechas" R2.9 + validaciones R8; fechas de uso ocultas R1.11), sin probar en navegador | Diego: correr `docs/sql/campanas_ediciones.sql` en Supabase y `npx prisma generate`; probar al final del requerimiento la lista única de `cambios.md` (piezas 1a a 3b; 3a/3b: fechas de uso en Campañas, línea en la portada y rombos en los selectores); (pieza 2: cargar una edición en `/campanas-plataforma`, ver el Cyber Wow en Campañas, Black Friday/Cyber Monday el 30 nov) y 1b (Safari, hora frontera); luego QA de pieza 2. Esta Fase 1 va antes que multi-sede | 2026-10-20 |
| Precio y descuento calculados en el servidor (productos) — **bug crítico de seguridad** | [ADR-0001](adr/ADR-0001-precio-calculado-en-servidor.md) · [impacto](specs/precio-en-servidor/impacto.md) · [tareas](specs/precio-en-servidor/tasks.md) · [cambios](specs/precio-en-servidor/cambios.md) · origen: [campanas-cuando](specs/campanas-cuando/spec.md) (Q5, P-b) | en desarrollo (piezas 1-4 listas, sin commit; sin QA ni navegador por pedido de Diego) | Te toca: revisar / pasar a QA las piezas 1-4 y pedir commit. Pendiente: actualizar el e2e `e2e/checkout/` (body sin montos, mock de `/cotizar`, caso 409). Al desplegar: SQL `docs/sql/precio_en_servidor.sql` en Supabase **antes** del backend (y revisar la consulta de cupones > 100 %); llave opcional `RATE_LIMIT_COTIZAR_MAX`; backend antes que la Tienda | 2026-10-20 |
| Campañas: rediseño en 3 pasos y promoción de precios (productos) — es el R5 de campanas-cuando | [spec](specs/campanas-descuento/spec.md) · [diseño](specs/campanas-descuento/diseno.md) · [prototipo](disenos/campanas-descuento/v1-2026-10-20.html) · [ADR-0001](adr/ADR-0001-precio-calculado-en-servidor.md) · [ADR-0002](adr/ADR-0002-campana-en-tres-pasos.md) · [impacto](specs/campanas-descuento/impacto.md) · [tareas](specs/campanas-descuento/tasks.md) | en desarrollo (pieza C4 lista: todas las piezas C1–C7 y C4 programadas, sin commit; backend 2188 OK, Admin 265 OK + build OK, Karma Tienda 374 OK; e2e de C6 escrito sin correr; sin QA ni navegador por pedido de Diego) | Te toca: revisar / pasar a QA C1–C7 y C4 y pedir commit. Despliegue completo, en orden: precio-en-servidor P1–P4 (SQL `precio_en_servidor.sql` antes de su backend) → C2 (SQL `campanas_descuento_historial.sql` antes del backend; publicar cuanto antes) → C3a + C3b (SQL `campanas_descuento_promociones.sql` antes del backend) → C5 (Tienda) → C6 (SQL `campanas_descuento_pedidos.sql` y llave `PRECIOS_TOKEN_SECRET` en Railway antes del backend; luego Tienda y Admin) → C7 (Backend → Tienda) → **C4 al final** (Backend → Admin; sin SQL ni llaves), después de la revisión legal de `textos-legales.ts` (Admin) y `condiciones.ts` (Tienda), Q8. C1 (Admin) se puede publicar en cualquier momento. [cambios](specs/campanas-descuento/cambios.md) | 2026-10-20 |
| Límites de uso por tienda (que una tienda no afecte a las demás: ritmo, cuota de IA, tope simultáneo a la IA) | [spec](specs/limites-por-tienda/spec.md) | borrador | Aprobar la spec y responder P1-P7 y P9 (valores por defecto: medir uso real primero). La cuota mensual por tienda ya existe (`consumo-ia`); la spec la extiende | 2026-10-19 |
| Confianza en la reserva ("la reserva dice la verdad"): avisos de la tienda en la página de la reserva, contacto de respaldo, etapa del día (en camino, llegó), reconfirmación automática y contrato visible; transversal a los rubros de reserva | [spec](specs/confianza-reserva/spec.md) · origen: [servicios-a-domicilio](specs/servicios-a-domicilio/spec.md) | aprobada · siguiente: `disenador` (fases 1 y 2) | Aprobar el diseño cuando esté. Se construye ya, sin esperar el rubro nuevo ni la validación con agencias. Preguntas aún abiertas: P7, P9, P11, P16, P17 (no bloquean el diseño) | 2026-10-20 |
| Servicios para fiestas a domicilio (rubro nuevo `trabajadores`, especialidad `fiestas`): servicios y paquetes, personal con agenda, dirección y zonas, ventana de llegada, reemplazo | [spec](specs/servicios-a-domicilio/spec.md) · depende de [confianza-reserva](specs/confianza-reserva/spec.md) | aprobada · fase 3 después de validar con agencias | Validar con 5 a 8 agencias antes de la fase 3 (qué preguntar: P2 en la spec). Mientras tanto no se diseña ni se construye este rubro; solo avanza confianza-reserva. Preguntas abiertas para el diseño: P6, P8, P10, P12 a P15 | 2026-10-20 |
| El planificador de la fiesta (herramienta del cliente: lista con notas, gastos y presupuesto, invitados; plantillas de la agencia; la agencia no la ve) | [spec](specs/planificador-fiesta/spec.md) · relacionada: [servicios-a-domicilio](specs/servicios-a-domicilio/spec.md) | borrador | Aprobar la spec y responder P1-P5 (cómo entra el cliente, responsable de datos personales con revisión legal antes de la fase 2, qué ve la agencia, capacidad común, quién puede crear uno). Recomendación: fase 1 sin invitados; validar con 5 organizadores en paralelo | 2026-10-20 |

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
