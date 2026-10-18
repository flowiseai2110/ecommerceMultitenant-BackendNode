# Tareas: multi-sede

> Spec: [spec.md](spec.md). Una pieza a la vez: no se empieza la siguiente sin verificar la anterior.

## Antes de la pieza 1 (S17.1)
- [ ] Cerrar el trabajo abierto en reservas: motor de reservas M1/M2 (SQL `cupo_externo`), ciclo de la reserva, mejoras de la reserva, ocupación del buscador
- [ ] Correr sus SQL pendientes en Supabase y probar en el navegador
- [ ] Commit por función; los tres repos sin cambios pendientes

## Pieza 1 — Datos, `ALCANCE` y alcance por sede (Backend, nada visible)
- [ ] Prisma: `sedes`, `razones_sociales`, `config_sede`; `sede_id` en las tablas `sede` de S3; `usuario_tiendas.sedes`
- [ ] `docs/sql/multi_sede_fase_1.sql`: idempotente, en transacción; sede principal + razón social por defecto por tienda; copia de los campos operativos de `config_reservas`; llena `sede_id` y después `NOT NULL`
- [ ] Requiere: pieza 1 de [antipatrones](../antipatrones/tasks.md) (`ALCANCE` con `tienda`/`global` y auto-scope ya armado desde ahí)
- [ ] `kernel/tenant/alcance.js`: agregar la clasificación por sede de S3; `config/prisma.js` arma `SEDE_SCOPED_MODELS` desde ahí
- [ ] Contexto: `sedeId` / `sedesPermitidas` en el ALS; error `SEDE_REQUERIDA`
- [ ] Revisar los `$queryRaw` de reservas, recepción y caja para que reciban la sede como parámetro obligatorio (S2.7)
- [ ] Escrituras por id validan la sede del registro (S2.7)
- [ ] Índices compuestos `(tienda_id, sede_id, fecha)` (S15.6); los de tablas grandes con `CONCURRENTLY`, aparte
- [ ] `ALCANCE` → `Set` al arrancar; sedes permitidas en la caché de membresía (S15.8)
- [ ] Test de contrato S2.5, tests de dos sedes (disponibilidad, cotización, solicitud) y tests negativos por endpoint (S2.7)
- [ ] Sedes sin borrado: solo desactivar, con las reglas de S1.4
- [ ] RLS en las tablas nuevas desde el SQL + verificación automática de que ninguna tabla pública quede sin RLS (S16.9)
- [ ] Invalidar la caché de membresía al cambiar rol, sedes o estado (S16.1)
- [ ] Lectores de datos fiscales (checkout, comprobante, libro) leen `razones_sociales`; las columnas de `tiendas` se quedan (S1.2)
- [ ] Compatibilidad: sin `sede` → sede principal o todas las permitidas (S17.2)
- [ ] `multi_sede_fase_1_reversa.sql` + respaldo; ida y vuelta probadas en una copia de la base (S17.4)
- [ ] Etiqueta `sedeId` en Sentry y en las métricas (S17.5)
- [ ] Script de datos demo con dos sedes (S17.6)
- [ ] Prueba de carga base (k6) antes y después: sin regresión en cotización y disponibilidad (S15.11)
- [ ] Verificar: tiendas demo actuales sin cambios visibles
- [ ] Despliegue en orden backend → Admin → tienda (S17.3)

## Pieza 2 — Presencia y override (Backend)
- [ ] Columnas `presencia` / `presencia_sedes` en `hotel_temporadas`, `hotel_extras`, `hotel_planes`, `cierres_fecha`
- [ ] `hotel_extras_sede`, `hotel_temporadas_sede`
- [ ] `enSede(fila, sedeId)` en el kernel, sin consultas: presencia y override se cargan en una consulta con `LEFT JOIN` (S15.4); cotización y disponibilidad la usan
- [ ] Al escribir, validar la presencia con `enSede()`: un extra, plan o temporada ausente en la sede da 400 (S16.6)
- [ ] Cupones con presencia (S3.6)
- [ ] Tests: una temporada en todas con override en una; un extra ausente en una sede; un cupón solo de una sede

## Pieza 3 — Admin: sedes y selector
- [ ] API Admin: CRUD de sedes y `config_sede`
- [ ] Configuración › Sedes (S9.1, S9.5)
- [ ] Selector global de sede y pantallas operativas con sede (S9.2)
- [ ] Formularios de presencia y override (S9.4)
- [ ] Sede siempre visible en Recepción y Caja; turno de caja atado a la sede (S9.7)
- [ ] Ajustes, anulaciones de reservas pagadas, devoluciones y derivaciones: rol admin o aprobación, y registro inmutable (S16.2)
- [ ] Validación del enlace de Google (https + lista de dominios), mapa con `encodeURIComponent`, textos por `textoRico` (S16.10)
- [ ] Avisos al personal de esa sede + owner (S10.4)
- [ ] Pedir dirección y ubicación de la principal antes de agregar una segunda sede (S17.7)

## Pieza 4 — Tienda: capacidad + hotel `al-entrar`
- [ ] Capacidad `sedes: { modo, seElige }` en los perfiles (+ `perfiles.spec.ts`) y en su espejo en el backend
- [ ] Pieza `selectorSede` en `PiezasUi` y las dos familias (+ `uis.spec.ts`)
- [ ] API pública `GET /store/sedes` (caché pública de 60 s) y `?sede=` en la URL de los endpoints de reservas, nunca en headers ni cookies (S15.5)
- [ ] `sedeId` en todas las `QueryKeys` de datos de sede + test (S7.14)
- [ ] "Reservas en: {sede}" en el panel, el resumen y la confirmación (S7.15)
- [ ] La sede y el precio los calcula el servidor desde el recurso; `sede` en el body se ignora; tests negativos (S16.6)
- [ ] Selector como chunk diferido; distancia calculada en el navegador (S15.9)
- [ ] Contacto con la sede: WhatsApp flotante, pie, seguimiento y correos (S7.17)
- [ ] Textos de la sede en traducciones (S7.18)
- [ ] Accesibilidad de la hoja y del chip (S7.20)
- [ ] Sede en los eventos de analítica (S17.8)
- [ ] Precedencia S7.1, chip, el recurso fija la sede, refresco que conserva la búsqueda
- [ ] Hotel: "¿A qué hotel vas?" con ubicación (S7.6)
- [ ] Sede en el seguimiento, los correos y el comprobante; "Mis reservas" con la sede
- [ ] Reseñas y nota solo de la sede elegida (S7.13)
- [ ] Tienda demo hotel Lima/Ica y prueba en el navegador (celular y computadora)

## Pieza 5 — Ninguna reserva perdida
- [ ] Contrato `disponibilidadEnSedes` (S6.4) en hotel y canchas
- [ ] `GET /store/reservas/disponibilidad-sedes` (S8.1): una consulta por tienda agrupada por sede (S15.1), solo lo necesario (S15.2), caché de 30 s invalidada al reservar (S15.3)
- [ ] Hotel: sugerencia de otras sedes (S8.2)
- [ ] Limitador en `/cotizar` y `disponibilidad-sedes` (S16.5)
- [ ] Prueba de carga: `disponibilidad-sedes` p95 < 300 ms con 5 sedes, sin errores de conexión (S15.11)

## Pieza 6 — Canchas `al-buscar`
- [ ] Buscador de día, hora y formato + grilla de todas las sedes (S7.7–S7.9)
- [ ] Sugerencias al no haber horario (S8.3)
- [ ] Grilla como chunk diferido; prueba de carga: un día con p95 < 300 ms (S15.11)
- [ ] Tope de apartados sin pagar por tienda y franja, Turnstile solo ante anomalías, aviso al dueño (S16.4)
- [ ] Accesibilidad de la grilla: teclado y celdas anunciadas (S7.20)
- [ ] Tienda demo canchas Surco/La Molina y prueba en el navegador

## Pieza 7 — Páginas de sede
- [ ] `/sedes` con mapa (librería solo en esta ruta) y `/sedes/:sedeSlug` con schema.org (S7.5)
- [ ] Canonical, descripción obligatoria, enlace a Google Business Profile y NAP desde una sola fuente (S7.16)
- [ ] Sede inactiva redirige a `/sedes` (S1.4)
- [ ] Nota en tienda-en-ssr: JSON-LD serializado escapando `<` como `<` (S16.10) y sitemap con las sedes (S17.9)
- [ ] Sección "Nuestras sedes" del home componible y vista previa por sede en el editor de Diseño (S7.19)

## Piezas 8–11 (hoja de ruta)
- [ ] 8. Personal por sede (S10) + panel consolidado (S11.1, S15.10) + reporte comparativo de anulaciones, ajustes y devoluciones (S16.2) + util compartido contra fórmulas de Excel en todo export (S16.7)
- [ ] 9. Clonar sede (S11.2) + precios en bloque (S12) + reserva entre sedes en Recepción (S9.3, S15.7) + "qué difiere entre sedes" e historial (S9.6) + mover una reserva pagada a otra sede (S9.8)
- [ ] 10. Razones sociales (S13, con S13.6 y S13.7) + re-autenticación y aviso al cambiar cuentas de cobro, MFA (S16.3) + devoluciones solo al medio original (S16.8) + webhooks por cuenta de pasarela (S13.8) + razón social en términos, seguimiento y correos (S13.9)
- [ ] 11. Agente IA con sedes (S14)

> Plan multi-sede: fuera de este spec; el usuario lo define al final.
