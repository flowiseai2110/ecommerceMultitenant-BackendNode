# Spec: mejoras de la reserva del hotel (lo mejor de Viñas Queirolo)

> Estado (2026-10-16): **borrador para revisar**. Tareas: [tasks.md](tasks.md).
> Base: [hospedaje-completo](../hospedaje-completo/spec.md) (B5 IGV, C1 cupo, C5 planes), [selector-fechas](../selector-fechas/spec.md) (calendario), [reserva-directa-hotel](../reserva-directa-hotel/spec.md).
> Relacionada: [paquetes-hotel](../paquetes-hotel/spec.md) (pestaña Habitaciones | Paquetes).
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Por qué

Comparamos la tienda con el motor de reservas del Hotel Viñas Queirolo (TravelClick, revisado el 2026-10-16). En lo básico estamos a la par o mejor:
- niños con edad;
- la nacionalidad quita el IGV sola;
- extras con dato, Yape y Plin;
- seguimiento con WhatsApp.

Ellos hacen mejor cinco cosas:

| Viñas Queirolo | Nosotros hoy |
|---|---|
| Calendario con el **precio de cada noche** y un punto en la **tarifa más baja** | Calendario sin precios |
| Precios **sin impuestos**: "US$ 273 + 76.44 impuestos y tasas por noche". En el pago, IGV 18 % y servicio 10 % aparte | Solo el precio final, sin recargo por servicio |
| **Código especial** (promocional) en la barra de búsqueda | No hay |
| Aceptar **términos y condiciones** y, aparte y opcional, recibir promociones | Solo el consentimiento de datos (Ley 29733) |
| Habitación con **tamaño (m²)** y "**media por noche**" | Sin tamaño; el precio es el de una noche |

Lo que **no** copiamos:
- el texto libre "1. Boleta, 2. Factura, 3. Extranjeros": nuestro selector es más claro;
- pedir los datos de la tarjeta en el formulario: con nosotros se paga en la pasarela;
- cobrar en dólares: seguimos en soles con la referencia "≈ US$".

## Requisitos

### H1. Precio por noche en el calendario
- **H1.1** La disponibilidad por mes de la tienda devuelve, por noche, el cupo y el **precio** de cada tipo, con las mismas reglas de `cotizarHotel`:
  - precio base o de viernes y sábado;
  - ajuste de la temporada.
  - Es el precio de una habitación por noche, sin extras, niños ni plan.
- **H1.2** En el buscador (sin habitación elegida), cada día muestra el **más bajo** entre los tipos con cupo. En la página de una habitación, el de esa habitación.
- **H1.3** Los días con el precio más bajo del mes llevan un punto ("Tarifa más baja") y una leyenda sobre el calendario.
- **H1.4** Sin cupo o cerrado, el día sale tachado y sin precio (como hoy).
- **H1.5** El precio se muestra según H2 (con o sin impuestos) y, si cabe, abreviado ("S/ 165", "S/ 1.2 mil").

### H2. Precios con o sin impuestos: lo decide la tienda
- **H2.1** Configuración › Reservas › "Cómo muestras tus precios":
  - **Con impuestos incluidos** (como hoy y por defecto): el precio que escribe el hotel es el final.
  - **Sin impuestos**: el hotel escribe el precio neto, y la tienda suma el IGV y el servicio.
- **H2.2** "Recargo por servicio" en % (0 a 13; por defecto 0). Viñas Queirolo cobra el 10 %. Se aplica en los dos modos: con impuestos incluidos va dentro del precio y se informa en el desglose.
- **H2.3** Cálculo (sobre el monto neto N de cada línea):
  - IGV = 18 % de N y servicio = s % de N.
  - Con impuestos incluidos, N = precio ÷ (1 + 0.18 + s).
- **H2.4** Cómo se ve:
  - **Sin impuestos:**
    - la tarjeta y el calendario muestran el neto ("S/ 273 por noche · + impuestos");
    - el panel de la reserva muestra subtotal, IGV, servicio y un **total** en grande;
    - el total con impuestos se ve **antes** de pagar, para que no haya sorpresas.
  - **Con impuestos incluidos:** como hoy, con la nota "Incluye IGV y servicio" en el total.
- **H2.5** Turista extranjero (B5, y paquetes-hotel P3.7): se quita el **IGV** del alojamiento (y de la alimentación marcada como exonerable). El servicio se mantiene. En los dos modos se usa el desglose de H2.3, así que el descuento es igual de exacto.
- **H2.6** La reserva guarda una copia del modo y del % (`impuestos`), para que el Admin y el comprobante muestren el mismo desglose aunque la tienda cambie después.
- **H2.8** Al cargar tarifas, como en el PMS: cada campo de precio del Admin (modalidades, temporadas, extras, paquetes) muestra **los dos valores**, con impuestos y sin impuestos. El hotel escribe el que tiene a mano y el otro se calcula al instante con el IGV y el % de servicio de la tienda. Debajo se ve el precio del turista extranjero (sin IGV, con servicio). Se guarda un solo valor, en el modo de la tienda.
- **H2.7** Es una opción de la tienda, no del rubro. Empieza en el hotel; tours y eventos la pueden usar después sin cambiar el cálculo.

### H3. Código promocional (pospuesto el 2026-10-16)
- Decisión del usuario: se hace cuando un cliente lo pida, reutilizando el módulo de cupones de la tienda. Sirve sobre todo al hotel que está en Booking o Expedia, para dar un precio directo sin publicarlo (paridad de tarifas).
- **H3.1** Admin › Reservas › Códigos: código, descuento (% o monto por noche), vigencia de la reserva, fechas de estadía en que vale, tipos de habitación, mínimo de noches, usos máximos y activo.
- **H3.2** Tienda: "¿Tienes un código?" en el buscador y en el panel de la habitación. `?codigo=` lo deja aplicado (para campañas).
- **H3.3** El descuento se aplica al alojamiento, después del plan de tarifa. Es una línea propia ("Código VERANO −10 %"). Un código que no aplica muestra el motivo: vencido, fechas, habitación o mínimo de noches.
- **H3.4** La reserva guarda el código. Los usos se cuentan al confirmar.

### H4. Términos y promociones
- **H4.1** Configuración: enlace o texto de los **términos y condiciones**. Si existe, la solicitud pide aceptarlos (obligatorio).
- **H4.2** Casilla **opcional** y sin marcar: "Quiero recibir promociones de {negocio}". Es aparte del consentimiento de datos, como pide la Ley 29733.
- **H4.3** Se guarda en la reserva (`acepta_terminos`, `acepta_promociones`), y la ficha del Admin dice si el cliente acepta promociones. Comunicados no cambia: solo manda avisos de la reserva, no promociones. El envío de promociones (por ejemplo, un código para el cliente que repite) usará este permiso cuando exista.

### H5. Tarjeta de la habitación
- **H5.1** Tamaño de la habitación en m² (`hotel_tipos_habitacion.metros`, opcional), en la tarjeta y la ficha.
- **H5.2** Con fechas elegidas: el precio es la **media por noche** de esa estadía, con el total debajo ("S/ 1,146 por 3 noches").

## Fuera de alcance
- Carrito de habitaciones de distinto tipo ("Habitación 1 +").
- Cobro en dólares.
- Guardar una tarjeta como garantía sin cobrarla.

## Para el manual
- **Calendario con precios:** el huésped ve cuánto cuesta cada noche y en qué días está tu tarifa más baja.
- **Cómo muestras tus precios:** en Configuración › Reservas eliges si tus precios ya incluyen IGV y servicio o si se suman al pagar. En los dos casos, el huésped ve el total antes de pagar.
- **Códigos:** crea un código en Reservas › Códigos y compártelo, o usa el enlace con `?codigo=` en tus campañas.
- **Promociones:** solo reciben tus promociones los huéspedes que lo aceptaron al reservar.
