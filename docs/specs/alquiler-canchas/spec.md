# Spec: Alquiler de canchas sintéticas (rubro `canchas`)

> Estado: **implementado y verificado** (2026-10-12): SQL aplicado en Supabase, tienda demo `los-cedros` (`scripts/seed-canchas.mjs`, dueño `canchas@yopmail.com`) y flujo probado por el usuario. Falta commit y deploy.
> Repos: BackendNode, FrontendStore, FrontendAdmin.
> Diseño de la vista del cliente: maqueta aprobada "Cancha Los Cedros" (claude.ai/artifact/1pvieL2mWPLwB4XYJHwb98). Copia en el repo: [docs/disenos/cancha-los-cedros/](../../disenos/cancha-los-cedros/).
> Base: [perfil-negocio](../perfil-negocio/spec.md) (Strategy por rubro), [layout-por-rubro](../layout-por-rubro/spec.md) (Abstract Factory de piezas), [mini-booking](../mini-booking/spec.md) (estados, pago y seguimiento), [alquiler-locales](../alquiler-locales/plan.md) (ocupaciones con restricción de exclusión).
> Relacionado: [grabacion-canchas](../grabacion-canchas/spec.md) (se conecta con estas reservas más adelante).

## Problema

En Lima hay unos 69 complejos de fútbol 7 y cientos de canchas de fulbito. La mayoría lleva las reservas en una pizarra o un cuaderno: hay reservas dobles y el cliente tiene que llamar para saber si hay hora (tesis ULIMA, 2020). La hora cuesta S/ 70–100 en el norte y sur de Lima, S/ 100–150 en el centro y hasta S/ 160–170 de noche en San Borja y Surco. Casi todas cobran más de noche (desde las 18:00) y los fines de semana.

## Objetivo

Que un complejo deportivo publique sus canchas y el cliente **separe un horario en un minuto**: elige día, cancha, duración y hora, ve el precio calculado y paga el adelanto por Yape. Sin llamar ni esperar respuesta.

## Reglas

- **R1 Cancha.** Un `productos` (nombre, fotos, descripción, reseñas) + su ficha 1:1 en `cancha_canchas`: formato (F5, F6, F7, F8, F9, F11), medidas, jugadores máximos, techada, superficie y **precio por hora de día y de noche**.
- **R2 Horario del complejo** (config de reservas): apertura, cierre (`00:00` = medianoche), hora en que empieza la tarifa noche y si sábados, domingos y feriados se cobran con tarifa noche todo el día. Duraciones que se ofrecen (60, 90 y 120 min por defecto). Los turnos empiezan a la hora en punto.
- **R3 Precio.** Se cobra por bloques de 30 minutos: cada bloque vale la mitad de la tarifa de su hora (un turno de 17:00 a 19:00 cobra una hora de día y una de noche). Lo calcula el backend; la tienda solo suma los bloques que el backend marcó como día o noche.
- **R4 Disponibilidad.** La regla "un horario nunca se vende dos veces" vive en la BD: `cancha_ocupaciones` tiene la restricción de exclusión `ex_cancha_ocupacion` (misma técnica que `local_ocupaciones`). Un apartado vencido no ocupa.
- **R5 Separación.** Por defecto, pago directo con adelanto del 50 %: la reserva nace `aceptada` con la cancha apartada `apartado_manual_min` minutos (30) para subir la captura. Con la captura, el apartado deja de vencer; al verificar el pago, se confirma. Si el negocio rechaza el pago, vuelve a tener un apartado nuevo. Cancelar o rechazar libera el horario. Con `cobro = en_destino` nace confirmada. Con `modo_confirmacion = solicitud` el negocio acepta primero (el horario queda apartado mientras tanto).
- **R6 Bloqueos.** El negocio bloquea horarios desde la agenda del admin (reservas por teléfono, mantenimiento, academia). Ocupan igual que una reserva.
- **R7 Fechas cerradas.** Las de `cierres_fecha` (de todo el complejo o de una cancha) no se ofrecen.
- **R8 Feriados.** Si `cancha_finde_noche`, los feriados nacionales (`libro-reclamaciones/plazos.js → FERIADOS`) también van con tarifa noche todo el día.

## Vista del cliente (FrontendStore)

Igual a la maqueta aprobada:

| Pieza | Dónde |
|---|---|
| Portada: antetítulo, título con acento, botones, tarifas "desde" de día y de noche, cancha dibujada y "Hoy quedan N horarios libres" | sección `canchas-portada` |
| Tarjetas de canchas (formato, medidas, jugadores, techada, precio día/noche, "Ver horarios") | sección `canchas` y página `/canchas` |
| Reservador: día (tira de 10 días) → cancha → duración → hora (libre día, libre noche en ámbar, ocupado tachado) y resumen con total y adelanto | sección `reservador`, página `/canchas` y ficha `/canchas/:slug` |
| Cómo funciona (3 pasos con el adelanto y el plazo reales de la configuración) | sección `pasos` |
| Servicios en tarjetas | `servicios`, variante nueva `tarjetas` y 6 íconos nuevos |
| Alquiler fijo semanal (banda oscura con botón a WhatsApp) | sección `fijo-semanal` |
| Preguntas frecuentes en dos columnas | `faq`, variante nueva `dos-columnas` |
| Ubicación con mapa | `ubicacion` (la de siempre, con mapa real) |
| Botón "Reservar" en el header | pieza `headerAcciones` de canchas |
| Barra inferior "Noche desde S/ X/h · Reservar" | pieza `navMovil` de canchas |
| Tipografía Barlow Condensed + Figtree, encabezados en mayúsculas | tipografía `deportiva`, encabezados `deportivo` |
| Verde cancha y ámbar de reflectores | paleta `cancha-*`, `--store-accent` |

"Separar con S/ X" lleva a `/reservar?cancha=slug&fecha=&hora=&min=` (solicitud común: titular, WhatsApp y correo) y de ahí al seguimiento, donde se sube la captura.

## Modelo de datos (docs/sql/canchas_fase_1.sql)

- `tiendas.tipo_negocio` suma `canchas`; `pedidos.tipo` y `reservas.tipo` suman `cancha`.
- `cancha_canchas` (ficha 1:1 del producto) y `cancha_ocupaciones` (franja `tstzrange` generada + `EXCLUDE USING gist`).
- `config_reservas`: `cancha_apertura`, `cancha_cierre`, `cancha_inicio_noche`, `cancha_finde_noche`, `cancha_duraciones`.
- `reservas.cancha` (JSONB): foto de la reserva (cancha, formato, duración, tramos día/noche con su precio).

## Backend

- `modules/negocio/canchas/datos.js`: capacidades (nueva: `alquilerPorHoras`, la declaran todos los rubros), plantilla `canchas-complejo`, secciones y config por defecto (pago directo, adelanto 50 %, apartado 30 min). Tema por defecto del rubro (`diseno.temaPorDefecto`): paleta `cancha-tinte`, tipografía `deportiva`.
- `modules/reservas/canchas/`: `tarifa.js` (puro: bloques y precio), `cotizar.js` (puro), `ocupaciones.js`, `canchas.service.js` (vitrina, agenda, ficha del admin, bloqueos) y `vertical.js` (`cotizar`, `apartadoInicial`, `enTransaccion`, `traducirError` y el hook nuevo `alCambiarEstado`, que sincroniza la ocupación con cada transición).
- `aplicarAccion` llama a `alCambiarEstado` de la vertical del pedido (`verticalDePedido` en el registro): las verticales mantienen su inventario sin `pedido.tipo === …` en el servicio común.
- Rutas de la tienda: `GET /store/reservas/canchas`, `/canchas/:slug`, `/canchas/agenda?fecha=`. Admin: `GET/PUT /reservas/canchas/:productoId`, `GET /reservas/canchas/agenda`, `POST/DELETE /reservas/canchas/bloqueos`.

## Admin (FrontendAdmin)

- Rubro `canchas` en el contrato y el registro; tienda nueva "Canchas deportivas".
- Menú: Reservas, Canchas (fichas), Agenda (grilla cancha × hora con reservas y bloqueos), Config. de reservas (sección "Horario de las canchas").
- Diseño: formularios de las secciones nuevas, variantes nuevas, tipografía `deportiva`, encabezados `deportivo`.
- Detalle de reserva de una cancha.

## Fuera de alcance (siguiente fase)

- Alquiler fijo semanal automático (hoy el botón abre WhatsApp con el mensaje armado).
- Asesor IA propio del rubro (usa el genérico).
- Grabación de partidos ([grabacion-canchas](../grabacion-canchas/spec.md)).

## Tareas

- [x] C1 SQL (`docs/sql/canchas_fase_1.sql`) y Prisma (schema válido, cliente generado). **El SQL no se ha corrido en Supabase.**
- [x] C2 Backend: rubro (`negocio/canchas/`, capacidad `alquilerPorHoras`), tarifa y cotización puras, ocupaciones con exclusión, vertical con `alCambiarEstado` (hook en `aplicarAccion`, `verticalDePedido`), rutas de tienda y admin, correos, serializer, Diseño (5 secciones, variantes `tarjetas` y `dos-columnas`, antetítulos, 6 íconos, encabezados `deportivo`, plantilla `canchas-complejo`, paleta `cancha-*`, tipografía `deportiva`, tema por defecto del rubro). Tests: `canchas.cotizar`, `canchas.vertical`, rutas, contrato.
- [x] C3 Tienda: perfil y UI del rubro (botón "Reservar" del header, barra inferior, rutas `/canchas` y `/canchas/:slug`), secciones de la home, reservador, ficha, solicitud (`?cancha=&fecha=&hora=&min=`) y seguimiento, tema. Test `canchas.util.spec`.
- [x] C4 Admin: perfil y registro, lista y ficha de canchas, agenda cancha × hora con bloqueos, sección "Horario de las canchas" en Config. de reservas, editor de Diseño (secciones nuevas), detalle de reserva, alta de tienda "Canchas deportivas".
- [x] C5 Correr el SQL en Supabase, `npx prisma generate` en Railway, crear una tienda demo con 3 canchas y verificar en el navegador (escritorio y celular): reservar, subir captura, verificar pago, cancelar, bloquear desde la agenda y que dos reservas del mismo horario den 409.

## Decisiones tomadas al implementar (2026-10-11)

- La cancha se crea sin precio en el formulario de producto (como el tipo de habitación): lo fija su ficha y el producto queda con el precio "desde".
- En modo "solicitud" el horario queda apartado durante `respuesta_horas`; con pago directo, `apartado_manual_min` (30). Las dos con tope en el inicio del turno.
- Las secciones con afirmaciones (`servicios`, `faq`, `fijo-semanal`) se copian ocultas, como en los demás rubros: el dueño las revisa antes de publicarlas.
- La portada de canchas usa sus propios textos y, sin ellos, los de Diseño › Portada y luego el nombre y la descripción de la tienda.
- "Cómo funciona" no tiene textos editables: se arma con la configuración de reservas para no prometer algo distinto de lo que pasa al reservar.
- Diferencias con la maqueta: precios con la tipografía de la tienda (sin la fuente monoespaciada), mapa real de Google en lugar del dibujo, y la barra inferior del celular va dentro del menú inferior de la tienda (Inicio · Noche desde S/ X · Reservar · Contacto).
