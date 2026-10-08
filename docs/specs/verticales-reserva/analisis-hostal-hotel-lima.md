# Análisis: un hostal y un hotel de Lima sobre mini booking

> Fecha: 2026-10-08. Prueba de punta a punta en local (tienda en el puerto 4200, backend en el 3000).
> Objetivo: ver si la plataforma soporta un hostal y un hotel reales de Lima, y qué falta para que el huésped tenga una buena experiencia.
> Base: [mini-booking](../mini-booking/spec.md) (lo construido), [hotel.md](hotel.md) (diseño completo, referencia futura) y [analisis-infhotel.md](analisis-infhotel.md).

## 1. Las dos tiendas de prueba

Los negocios son **ficticios**. Los precios, horarios y políticas salen de una investigación de hostales y hoteles reales de Barranco y Miraflores (Hostelworld, Kayak, Hotels.com, abril–octubre 2026). Las fotos son de Pexels.

| | Killa Hostal Barranco (`killa-hostal`) | Hotel Mirador Miraflores (`mirador-miraflores`) |
|---|---|---|
| Perfil | Hostal para mochileros, mayoría extranjeros | Hotel de 4 estrellas, turismo y negocios |
| Habitaciones | Cama en dormitorio mixto de 8 (S/ 45) y femenino de 6 (S/ 55), privada doble con baño compartido, matrimonial y triple con baño privado (S/ 120–190) | Estándar Queen, Superior Twin, Superior Vista al Mar, Junior Suite, Suite Familiar (S/ 290–690) |
| Fin de semana | Precio de viernes y sábado más alto | Precio de viernes y sábado más alto |
| Check-in / check-out | 14:00 / 11:00 | 15:00 / 12:00 |
| Cobro | En destino (pagas al llegar) | Adelanto del 30% |
| Cancelación | Gratis hasta 3 días antes; si no, primera noche | Gratis hasta 48 h antes; si no, se pierde el adelanto |
| Home | Plantilla Boutique con servicios, imagen y texto, ubicación, políticas, preguntas y contacto | Igual |
| Dueña | `booking@yopmail.com` (la misma de `demobooking`; el admin permite cambiar de tienda) | Igual |

Datos y carga: `scripts/demo/hotel/killa-hostal.json` y `mirador-miraflores.json` con `seed-habitaciones.mjs`.

Lo que se investigó y se usó en el armado:
- **Hostales de Lima:** dormitorios de 6 a 8 camas, mixtos y solo mujeres, a US$ 16–18 la cama. Privadas a US$ 44–52. Desayuno básico incluido, cocina compartida, lockers con candado propio, recepción 24 h sin toque de queda, guarda de equipaje y tours. Cancelación gratis 1 a 4 días antes y, si no, cobran la primera noche. Pago al llegar.
- **Hoteles de Miraflores:** habitaciones de estándar a suite, algunas con vista al mar, de US$ 100 a 250. Desayuno incluido, traslado al aeropuerto con costo, cancelación gratis hasta 24–72 h antes. Early check-in y late check-out según disponibilidad.
- **Impuestos:** un turista extranjero que se queda menos de 60 días y presenta pasaporte y tarjeta andina de migración está exonerado del IGV (18%).

## 2. Lo que ya funciona bien

- La home con plantilla Boutique se ve completa en el celular y en escritorio, sin errores ni scroll horizontal.
- El buscador de la portada (llegada, noches, huéspedes) filtra por capacidad: para 4 huéspedes el hotel muestra solo las dos suites y avisa "3 sin capacidad para 4".
- **Precio por persona** en los dormitorios: 2 amigos × 3 noches = S/ 310, con el viernes y el sábado al precio de fin de semana.
- Niños por habitación: la Suite Familiar acepta 2 adultos + 2 niños, y las habitaciones del hostal dicen "solo adultos".
- El adelanto del 30% se calcula bien: "Pagas S/ 663 al confirmar · S/ 1547 en el hotel".
- Políticas, check-in, cancelación e instrucciones salen de la configuración de reservas y se ven en la home y en la ficha.
- Servicios con íconos propios de hospedaje (desayuno, recepción 24 h, cocina, terraza, traslado, equipaje).

## 3. Lo que falta, por impacto

### A. Errores y textos (rápidos, alto impacto)

| # | Problema | Dónde | Propuesta |
|---|---|---|---|
| A1 | El **pie de página** de un hospedaje muestra "Mi carrito", "Rastrear mi pedido", "Todos los productos", "Envíos y entregas", "Política de devoluciones" y, en métodos de pago, "Pago contra entrega" | `store-footer.component.ts`; el onboarding precarga envíos y pagos de e-commerce | Para negocios de reservas: links a Habitaciones, Mis reservas, Políticas y Libro de Reclamaciones. No mostrar envíos ni "contra entrega" |
| A2 | Un **hostal** dice "el hotel": "Pagas en el hotel", "El hotel confirma la disponibilidad" | `reservas.util.ts` (`negocio: 'el hotel'`), `policies-section`, `habitaciones-grid` | Que el dueño elija cómo se llama ("el hostal", "la casa", "el hotel"), o un texto neutro ("te confirmamos") |
| A3 | `/habitaciones` usa un subtítulo fijo, no el de la sección del diseño | `habitaciones-grid.component.ts` (`SUBTITULO`) | Usar el subtítulo de la sección `habitaciones` |
| A4 | La tarjeta de un dormitorio dice "Hasta 8 personas": parece una habitación para 8, no una cama | Tarjeta y ficha con `porPersona` | Con `porPersona`: "Precio por cama · dormitorio de 8 camas". En "Otras habitaciones" también falta "por persona" |
| A5 | Cada tarjeta repite la etiqueta "Noche" aunque sea la única modalidad | Tarjeta de habitación | Mostrar las modalidades solo si hay más de una |
| A6 | "Pagas S/ 0.00 al confirmar · S/ 310 en el hotel" cuando el cobro es en destino | Panel de solicitud | "Pagas todo al llegar: S/ 310" |
| A7 | El mapa busca "distrito + nombre de la tienda": sin dirección exacta, Google marca otro negocio de nombre parecido (con "Mirador" marcó dos hoteles reales) | `ubicacion` y la ficha | Pedir dirección exacta o un punto en el mapa al configurar; buscar solo por dirección |
| A8 | La tienda nace sin logo y el header queda con un cuadro vacío | Onboarding | Usar las iniciales del nombre mientras no haya logo |

### B. Cosas que el dueño no puede configurar (medio)

| # | Falta | Por qué importa | Hoy se resuelve con |
|---|---|---|---|
| B1 | **Fechas especiales y mínimo de noches** (Fiestas Patrias, Año Nuevo, feriados largos) | Son las fechas que más venden; hoy solo hay precio de lunes a jueves y de viernes a sábado | Nada: el dueño corrige el precio al confirmar |
| B2 | **Extras reservables**: traslado al aeropuerto, early check-in, cama adicional, cuna | El traslado es lo primero que pide un extranjero que llega de noche | Texto en servicios y preguntas + WhatsApp |
| B3 | **Política de niños**: edad máxima, gratis hasta cierta edad, cargo por cama adicional | Las familias no saben cuánto pagan los niños; hoy solo cuenta si caben | Texto en la descripción |
| B4 | **IGV para turistas extranjeros**: precio sin IGV y país o pasaporte en la solicitud | El hotel debe saber al cotizar si factura con o sin IGV | Texto en instrucciones y preguntas |
| B5 | **Dormitorio solo mujeres** como regla y no solo como texto | Cualquiera puede pedir esa cama | El dueño rechaza la solicitud |
| B6 | **Fotos propias** en "Imagen y texto" y una **galería del lugar** (terraza, desayuno, recepción) | Un hostal vende ambiente; hoy la sección solo usa el banner, una categoría o un producto | Repetir el banner |

### C. Estructurales (grandes; ya diseñadas en [hotel.md](hotel.md))

| # | Falta | Efecto en el huésped | Referencia |
|---|---|---|---|
| C1 | **Disponibilidad real**: cuántas habitaciones de cada tipo o cuántas camas por dormitorio | Toda reserva es una solicitud que el negocio confirma a mano. Un extranjero en Booking espera confirmación inmediata | "Disponibilidad diaria" y "Habitaciones físicas" en hotel.md |
| C2 | **Varias habitaciones en una sola solicitud** | Una familia de 5 o un grupo de amigos hace varias solicitudes separadas | Reservas con varias habitaciones en hotel.md |
| C3 | **Inglés** en la tienda y en los correos | En el hostal la mayoría de los huéspedes es extranjera | No está diseñado |
| C4 | **Dólares** además de soles | Los hoteles de Lima cotizan en US$ al turista | Fuera de alcance en mini booking; INFHOTEL confirma que es real |
| C5 | **Planes de tarifa** (no reembolsable más barato, con o sin desayuno) | Es el estándar de Booking y Expedia | "Planes tarifarios y temporadas" en hotel.md |
| C6 | **Reseñas al empezar**: una tienda nueva no tiene reseñas y la sección no se muestra | Reservar sin reseñas da desconfianza; las que tiene el negocio están en Booking o Google | Importarlas o enlazarlas |

## 4. Orden sugerido

1. **A1–A8** en una sola entrega: son textos y vistas, sin modelo de datos nuevo, y hoy hacen que un hospedaje parezca una tienda de productos mal configurada.
2. **B1 (fechas especiales y mínimo de noches)** y **B2 (extras)**: son lo que más pide un hotel pequeño y entran en el modelo actual (modalidades y líneas de precio).
3. **B4 (IGV para extranjeros)** junto con la facturación: toca comprobantes.
4. **C1 (disponibilidad)** es el salto de "vitrina con solicitud" a "reserva inmediata". Conviene decidirlo con clientes reales, porque cambia el alcance de mini booking.

## Fuentes

- [Harmony Inn Miraflores – Hostelworld](https://www.hostelworld.com/hostels/p/329854/harmony-inn-miraflores/)
- [Lima Hostel (Barranco) – Hostelworld](https://www.hostelworld.com/hostels/p/333972/lima-hostel/)
- [Hostales de Miraflores – Kayak](https://www.es.kayak.com/Lima-Hoteles-The-Place-Of-Miraflores-Hostal.438347.ksp)
- [Quinta Miraflores Boutique Hotel – Hotels.com](https://uk.hotels.com/ho1056679744/quinta-miraflores-boutique-hotel-lima-peru/)
- [Hoteles en Miraflores – Hotels.com](https://ie.hotels.com/nh1648009/hotels-in-miraflores-lima-peru)
- [Mejores hostales de Lima – Hostelz](https://www.hostelz.com/en/best-hostels-lima)
- [Exoneración de IGV a turistas – La Cámara](https://lacamara.pe/?p=69116)
