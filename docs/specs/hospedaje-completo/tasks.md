# Tareas: hospedaje completo

Spec: [spec.md](spec.md).

## Fase A — Textos y vistas
- [x] A1 Store: pie de página de reservas (links, métodos de pago sin contra entrega).
- [x] A2 Backend: onboarding sin envíos ni contra entrega para tiendas de reservas.
- [x] A3 Store: subtítulo de la sección en `/habitaciones`, `/tours`, `/eventos`.
- [x] A4 Store: "por cama" y "Dormitorio de N camas" con `porPersona`.
- [x] A5 Store: etiqueta de modalidad solo si hay más de una.
- [x] A6 Store: "Pagas todo al llegar" con cobro en destino.
- [x] A7 Store: mapa solo con la dirección; admin: ayuda en la dirección.
- [x] A8 Store: iniciales cuando no hay logo.
- [x] A9 Verificación en el navegador con `killa-hostal` y `mirador-miraflores`.
- [x] A10 (hallado al probar) Cobro en destino: aceptar confirma (no pide una captura de S/ 0); con confirmación inmediata nace confirmada y pendiente de pago; correos según el estado inicial (`nuevaReservaEmail` al negocio). 2 tests nuevos (94 en verde).
- [x] A11 (hallado al probar) El `@if` del logo rompía la hidratación (NG0500): logo e iniciales con clases.

## Fase B — Lo que el dueño configura
- [x] B0 Schema + `docs/sql/hospedaje_fase_b.sql`.
- [x] B1 Tipo de alojamiento: backend, admin (config de reservas), textos de tienda y correos.
- [x] B2 Temporadas: backend (CRUD, cotización, mínimo de noches), admin (pantalla Tarifas), tienda (líneas).
- [x] B3 Extras: backend (CRUD, cotización, snapshot), admin, tienda (ficha y solicitud).
- [x] B4 Niños: backend (config, edades, cargo), admin, tienda (edades en el panel).
- [x] B5 IGV turistas: backend (cotización por nacionalidad), admin, tienda.
- [x] B6 Solo mujeres: backend, admin (ficha de habitación), tienda (insignia y confirmación).
- [x] B7 Fotos propias en `imagen-texto` y sección `galeria`: backend (schema, subida), admin, tienda.
- [x] B8 Tests: backend 866 + 14 nuevos (cotización fase B, galería, URLs de fotos); admin 50. Navegador (tienda): Año Nuevo +40 % con mínimo de 3 noches, niño de 9 años S/ 40 × noche, traslado × 2 con número de vuelo, IGV −S/ 475.32 a un estadounidense, voz "el hostal", galería con visor y teclado, foto propia, solo mujeres.
- [ ] B9 Verificación del admin en el navegador (Tarifas, configuración, galería): junto con la fase C.
- [x] B10 (hallado al probar) El botón de "imagen y texto" llevaba a /productos también en hotel, tours y eventos.

## Fase C — Lo que el huésped espera
- [ ] C0 Schema + `docs/sql/hospedaje_fase_c.sql`.
- [ ] C1 Inventario y disponibilidad: backend (cupo, bloqueo, endpoint), admin (unidades, pestaña Disponibilidad, aviso al aceptar), tienda (grilla y ficha).
- [ ] C2 Varias habitaciones del mismo tipo.
- [ ] C3 Inglés: idiomas de la tienda, diccionario de la tienda, traducciones con IA, pestaña Inglés en el admin, correos.
- [ ] C4 Referencia en dólares.
- [ ] C5 Planes de tarifa.
- [ ] C6 Reseñas externas y correo de reseña tras la estadía.
- [ ] C7 Tests backend y verificación en el navegador.
