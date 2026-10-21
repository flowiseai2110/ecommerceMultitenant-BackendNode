# Spec: el planificador de la fiesta (herramienta del cliente)

> Estado: borrador · Fecha: 2026-10-20 · Rubros: `trabajadores` (especialidad `fiestas`); candidato como capacidad para `locales` (ver R9 y P4)
> Repos: Backend · Admin · Tienda
> Origen: la fiesta del 17/10 de Diego. Relacionada con [servicios-a-domicilio](../servicios-a-domicilio/spec.md) (el rubro donde nace) y [confianza-reserva](../confianza-reserva/spec.md) (la página de la reserva).

## Por qué

La esposa de Diego organizó la fiesta con una lista propia de 12 cosas:

1. Decoración con tema de Bluey (contratación).
2. Torta con diseño de Bluey.
3. Piñata con regalos.
4. Mochilas y sorpresas para hombre y mujer, que se entregan al final.
5. Dulces (los compraron en Plaza Vea).
6. Carrito sanguchero (contratación).
7. Bocaditos.
8. Bebidas.
9. Pizza.
10. Polos de Bluey que digan papá, mamá e hijo.
11. Sillas (contratación).
12. Local (contratación).

"Todo eso fue el gasto y las compras que hicimos." La animación era 1 de 13 cosas. Quien organiza una fiesta lleva en la cabeza, en un cuaderno o en un chat decenas de decisiones, compras, contrataciones y gastos, y casi nada de eso pasa por la agencia de animación.

**Qué se quiere lograr.** Que la agencia regale al cliente una herramienta útil para organizar toda su fiesta, y que por eso el cliente la prefiera, vuelva y la recomiende (engancharlo y fidelizarlo). Hoy el sistema no ofrece nada de esto.

**Quién sufre el problema.** La mamá, o quien organice: pierde de vista qué falta, cuánto lleva gastado y cuántos invitados vienen. La agencia no lo sufre directamente: lo que gana al ofrecer la herramienta es la relación con el cliente.

## Decisión de producto que ordena todo

**El planificador es del cliente, no de la agencia.** La agencia no lo ve (decisión de Diego). La agencia solo prepara plantillas de ejemplo. Esto simplifica el diseño y reduce riesgos, y hace que cada pantalla y cada regla de esta spec responda a una pregunta: ¿quién puede ver esto? Respuesta por defecto: solo el cliente y las personas que él invite.

## Conceptos

| Término | Qué significa |
|---|---|
| Planificador | La lista de una fiesta concreta, de un cliente. Tiene nombre, fecha (opcional), presupuesto (opcional), ítems, gastos e invitados. |
| Plantilla | Un planificador de ejemplo que arma la agencia ("Fiesta infantil completa"). El cliente la elige y se copia a su planificador. |
| Plantilla base | Una plantilla que trae la plataforma para cada especialidad, para que la agencia no empiece de cero. |
| Ítem | Una cosa por hacer: contratar la decoración, comprar la torta, elegir la piñata. |
| Tipo de ítem | `contratación`, `compra`, `tarea` o `entrega` (lo que se entrega al final, como las mochilas). |
| Categoría | Grupo de ítems (decoración, comida, recuerdos, local). El cliente puede crear las suyas. |
| Estado del ítem | `pendiente`, `en curso` (cotizando, coordinando) o `listo`. |
| Nota | Texto libre de un ítem ("el diseño tiene que decir Bluey y la edad", "recoger el jueves"). |
| Monto | El precio de un ítem, en soles. |
| Presupuesto | El tope que el cliente quiere gastar. Es opcional. |
| Invitado | Una persona (o niño) de la lista, con su tipo (niño o adulto) y si confirmó. |
| Co-organizador | Otra persona con cuenta (la pareja, un familiar) a quien el dueño da acceso para editar. |
| Dueño | El cliente que creó el planificador. |

## Lo que existe hoy (para no duplicar)

| Pieza | Qué hace hoy | Límite que importa aquí |
|---|---|---|
| Cuenta del cliente | "Mi cuenta" con inicio de sesión de Google; lista "Mis reservas" por tienda (`listarReservasCuenta`, layout-por-rubro 3.5). | Sin verificar con qué alcance se guarda: global o por tienda. Lo resuelve el arquitecto. |
| Enlace de seguimiento de una reserva | Token firmado, sin cuenta (`reservas.token.js`): muestra estado, datos de pago, permite subir la captura. | Es reenviable por diseño. El planificador **no** puede usar este mecanismo (R6.1). |
| Plantillas de Diseño | Plantillas de la tienda por rubro, que el dueño elige y edita. | Son de diseño visual, no de listas. Sirve como precedente de "plantilla del rubro que la tienda copia". |
| Perfil de negocio y capacidades | Cada rubro declara capacidades en los tres repos; el código compartido pregunta por capacidades, no por identidad. | Es el mecanismo para R9. |
| Recordatorios | No existe ningún proceso programado de recordatorios en reservas; confianza-reserva (fase 2) lo introduce. | Una fecha límite por ítem (fase 3) lo reutilizaría. |
| Datos personales | Las reservas piden aceptación de tratamiento de datos (Ley 29733) con el nombre del negocio como responsable (mini-booking R14.2). | Aquí el negocio **no** accede a los datos, así que no puede ser el responsable (R8, P2). |

## Rubros: dónde aplica y cómo

| Rubro | ¿Aplica? | Cómo se comporta | Regla de negocio que lo condiciona (`docs/rubros/<rubro>.md`) |
|---|---|---|---|
| `trabajadores` (especialidad `fiestas`) | Sí, es el rubro de origen | Capacidad encendida por defecto. Plantilla base "Fiesta infantil completa". Se ofrece desde la tienda y desde la página de la reserva. | No existe aún `docs/rubros/trabajadores.md`. |
| `locales` | Candidato: capacidad opcional | Quinceañeros, bodas y promociones tienen la misma necesidad (checklist, gastos, invitados). El local lo activa por tienda con sus plantillas ("Quinceañero completo"). Recomiendo construir primero para `trabajadores` y activarlo en `locales` solo después de validar (P4). | LOC-23 (sin carrito), LOC-16 (contrato) y CU-03/CU-04 de `locales.md`. No se tocan: el planificador no cambia la cotización ni los pagos del salón. |
| `eventos` | No aplica | Vende entradas a eventos públicos; el comprador no organiza nada. | `eventos.md`. |
| `tours` | No aplica | Ya muestra "qué llevar" en la ficha; no hay una lista que el cliente deba armar. | `tours.md`. |
| `hotel` | No aplica | La reserva es una estadía; no hay organización de un evento. | `hotel.md`. |
| `canchas` | No aplica | Turnos de 60 a 120 min; no hay planificación. | `canchas.md`. |
| `productos` | No aplica | Sin reservas. | — |

## Requisitos

### R1. El planificador del cliente
- **R1.1** Un cliente con sesión crea un planificador con nombre, fecha (opcional), ocasión y presupuesto (opcional). La fecha puede quedar vacía hasta que se sepa.
- **R1.2** Un cliente puede tener varios planificadores en la misma tienda (una fiesta cada uno).
- **R1.3** Solo el dueño y sus co-organizadores ven un planificador. Ni la agencia, en ningún rol (ni el dueño de la tienda ni sus empleados), ni otros clientes lo ven. No existe ningún enlace público. Ninguna pantalla ni ruta del panel de la tienda devuelve datos de un planificador.
- **R1.4** El dueño puede borrar su planificador o un invitado, y desaparece de verdad (no queda oculto ni visible para nadie).

### R2. Plantillas de la agencia
- **R2.1** La tienda crea, edita, duplica, activa y desactiva plantillas. Una plantilla tiene nombre, descripción, categorías y ítems (título, tipo, nota sugerida, orden). Máximo 10 plantillas por tienda y 60 ítems por plantilla (ajustables).
- **R2.2** La plataforma trae plantillas base por especialidad. La tienda las copia a las suyas y las edita. Sin plantillas propias, el cliente puede empezar en blanco.
- **R2.3** Al crear un planificador, el cliente ve las plantillas activas de **esa** tienda y la opción "Empezar en blanco". La plantilla se previsualiza sin iniciar sesión (R6.2).
- **R2.4** Al elegir una plantilla, sus ítems se **copian** al planificador. Editar o borrar la plantilla después no cambia los planificadores ya creados.
- **R2.5** Las plantillas no llevan precios, proveedores ni marca comercial. Los ítems de una plantilla no se muestran como "ofrecidos" por la agencia: son solo una guía (decisión de Diego).

### R3. La lista (checklist con notas)
- **R3.1** Un ítem tiene título, categoría, tipo, estado, nota y orden.
- **R3.2** El cliente agrega, edita, reordena y borra ítems, y crea sus propias categorías. Los ítems se agrupan por categoría.
- **R3.3** El estado del ítem es `pendiente`, `en curso` o `listo`. El planificador muestra el avance ("7 de 12 listos").
- **R3.4** La nota es texto libre de hasta 1.000 caracteres, sin formato. Se muestra siempre como texto, nunca como HTML.
- **R3.5** Se puede filtrar por tipo ("Por contratar", "Por comprar", "Para entregar") y por estado.

### R4. Gasto y presupuesto
- **R4.1** Cada ítem puede tener un monto en soles. Un ítem sin monto no suma.
- **R4.2** El planificador muestra el total gastado (suma de los montos) y el gasto por categoría.
- **R4.3** Si el cliente puso un presupuesto, se muestra cuánto queda. Si el total lo supera, se avisa; no se bloquea nada.
- **R4.4** El monto es una cifra por ítem en la primera versión. Separar estimado, adelanto y saldo es de la fase 3.

### R5. Invitados (fase 2)
- **R5.1** Un invitado tiene nombre, tipo (niño o adulto), estado (`invitado`, `confirmó`, `no va`) y una nota ("alergia al maní"). No se pide teléfono ni correo.
- **R5.2** El planificador muestra los totales: invitados, y confirmados por niños y adultos.
- **R5.3** Mínimo de datos: no se pide fecha de nacimiento ni fotos. De los menores se guarda solo el nombre de pila y la marca "niño".
- **R5.4** El cliente puede pegar una lista de nombres (uno por línea) para cargarla de una vez.
- **R5.5** Antes de guardar al primer invitado, se muestra un aviso de tratamiento de datos y el cliente lo acepta (R8.1).

### R6. Acceso y compartir
- **R6.1** Se entra con la cuenta del cliente de la tienda. Un planificador **nunca** se abre con un enlace con token, ni siquiera desde la página de la reserva: ese botón lleva a iniciar sesión.
- **R6.2** Sin sesión, el visitante puede ver las plantillas de la tienda y una vista previa. Para guardar un planificador necesita iniciar sesión.
- **R6.3** (fase 4) El dueño invita a un co-organizador por correo. La persona debe iniciar sesión con esa cuenta; puede editar todo menos borrar el planificador. El dueño le quita el acceso cuando quiera.
- **R6.4** (fase 4) El cliente exporta o comparte la lista como texto, PDF o impresión. Por defecto incluye ítems, notas, montos y solo el **conteo** de invitados; incluir nombres es una elección explícita en el momento de exportar.
- **R6.5** Un planificador pertenece a una tienda. Un cliente de la tienda A no puede leer, escribir ni listar nada de la tienda B, ni de otro cliente.

### R7. Relación con la reserva
- **R7.1** El planificador existe sin reserva: se puede crear antes de contratar a nadie.
- **R7.2** La página de la reserva ofrece "Planifica tu fiesta" (si la tienda tiene la capacidad). El botón lleva a iniciar sesión y a crear o abrir el planificador.
- **R7.3** (fase 4) El cliente con sesión vincula una reserva suya a su planificador. En la lista aparece un ítem "Animación" con la fecha, la hora y el estado de la reserva (por ejemplo, "reconfirmada hoy"), solo de lectura. La fecha de la fiesta se toma de la reserva. Los datos fluyen de la reserva al planificador, **nunca al revés**: la agencia no recibe nada del planificador.
- **R7.4** Después de la fecha, el planificador pasa a "Fiestas pasadas": se pueden consultar montos y notas. Los invitados se borran a los 90 días (P7).
- **R7.5** (fase 4) "Usar para otra fiesta" copia un planificador pasado con sus ítems y categorías en estado `pendiente`, sin montos ni invitados.

### R8. Datos personales de terceros
- **R8.1** Antes de guardar invitados, el cliente ve y acepta un aviso que dice: qué datos se guardan, para qué, quién es el responsable, cuánto tiempo y cómo borrarlos.
- **R8.2** Los datos del planificador se usan solo para el planificador. No se usan para marketing, no se venden, no se comparten con la agencia ni con terceros, y no se envían al asistente de IA ni a analítica por persona.
- **R8.3** El cliente puede descargar y borrar todos sus datos del planificador.
- **R8.4** Los nombres de invitados no aparecen en registros técnicos (logs) del sistema.
- **R8.5** Si una tienda deja la plataforma o se elimina, los planificadores de sus clientes no se borran sin aviso: se les avisa y pueden exportar (P8).

### R9. Capacidad por rubro
- **R9.1** El planificador es una **capacidad opcional** declarada en el perfil del rubro en los tres repos, activable por tienda. `trabajadores` la trae encendida; el resto de los rubros, apagada.
- **R9.2** Los textos y las plantillas base salen del perfil del rubro y de la especialidad ("Planifica tu fiesta" para fiestas; otro nombre para otro rubro). Nada fuera del perfil pregunta por la identidad del rubro.
- **R9.3** En una tienda sin la capacidad no aparecen menú, rutas, botón ni endpoints del planificador.

## Criterios de aceptación

Formato: **Dado** … **cuando** … **entonces** … (el QA los prueba tal cual).

**R1. El planificador**
- CA1 (R1.1, trabajadores): Dado un cliente con sesión, cuando crea un planificador con nombre "Cumple de Mateo" y sin fecha, entonces se guarda y aparece en su lista; al ponerle fecha después, se actualiza.
- CA2 (R1.2, trabajadores): Dado un cliente con un planificador, cuando crea otro, entonces ve los dos por separado.
- CA3 (R1.3, trabajadores): Dado un planificador con ítems e invitados, cuando el dueño de la tienda, un empleado o el rol más alto del panel intenta verlo (por la pantalla o por la API), entonces no existe ruta que lo devuelva y recibe "no encontrado" o "sin acceso".
- CA4 (R1.3, trabajadores): Dado dos clientes de la misma tienda, cuando el cliente B intenta abrir el planificador del cliente A (por su identificador), entonces recibe "no encontrado".
- CA5 (R1.4, trabajadores): Dado un planificador con invitados, cuando el dueño lo borra, entonces ya no se puede abrir ni listar, y sus invitados tampoco existen en ninguna consulta.

**R2. Plantillas**
- CA6 (R2.1, trabajadores): Dado el panel de una agencia, cuando crea la plantilla "Fiesta infantil completa" con 12 ítems en 4 categorías, entonces se guarda y puede activarla o desactivarla.
- CA7 (R2.1, trabajadores): Dado una tienda con 10 plantillas, cuando intenta crear la 11, entonces el sistema se lo impide y explica el límite.
- CA8 (R2.2, trabajadores): Dado una tienda sin plantillas, cuando abre "Plantillas", entonces ve las plantillas base de su especialidad y puede copiarlas; la copia es editable y no cambia la base.
- CA9 (R2.3, trabajadores): Dado una tienda con dos plantillas activas y una inactiva, cuando un visitante sin sesión abre "Planifica tu fiesta", entonces ve las dos activas y "Empezar en blanco", y puede previsualizar sin iniciar sesión.
- CA10 (R2.4, trabajadores): Dado un planificador creado desde una plantilla, cuando la agencia borra o cambia un ítem de la plantilla, entonces el planificador del cliente no cambia.
- CA11 (R2.5, trabajadores): Dado cualquier plantilla, cuando el cliente la elige, entonces los ítems no muestran precios, proveedores ni la marca "ofrecido por la agencia".

**R3. Lista**
- CA12 (R3.1/R3.3, trabajadores): Dado un planificador de 12 ítems, cuando el cliente marca 7 como `listo`, entonces ve "7 de 12 listos".
- CA13 (R3.2, trabajadores): Dado un planificador, cuando el cliente crea la categoría "Recuerdos", mueve un ítem a ella y reordena, entonces el orden y la categoría se conservan al volver a abrirlo.
- CA14 (R3.4, trabajadores): Dado una nota con `<script>alert(1)</script>`, cuando se muestra, entonces se ve como texto literal y no se ejecuta.
- CA15 (R3.4, trabajadores): Dado una nota de más de 1.000 caracteres, cuando intenta guardar, entonces no se guarda y se le dice el límite.
- CA16 (R3.5, trabajadores): Dado ítems de distintos tipos, cuando filtra "Por comprar", entonces ve solo los ítems de tipo `compra`; y si además filtra por estado `pendiente`, ve solo los de tipo `compra` que siguen pendientes.

**R4. Gasto**
- CA17 (R4.1/R4.2, trabajadores): Dado tres ítems con montos S/ 500, S/ 120 y S/ 80 y un cuarto sin monto, cuando abre el planificador, entonces el total es S/ 700 y el cuarto no suma.
- CA18 (R4.2, trabajadores): Dado ítems en las categorías "Comida" (S/ 300) y "Decoración" (S/ 400), cuando abre el resumen, entonces ve S/ 300 y S/ 400 por categoría.
- CA19 (R4.3, trabajadores): Dado un presupuesto de S/ 600 y un total de S/ 700, cuando abre el planificador, entonces ve el aviso "te pasaste S/ 100" y puede seguir editando.
- CA20 (R4.3, trabajadores): Dado un planificador sin presupuesto, cuando abre el resumen, entonces ve solo el total gastado, sin "restante".

**R5. Invitados**
- CA21 (R5.1/R5.2, trabajadores): Dado 10 invitados (6 niños, 4 adultos) donde confirmaron 4 niños y 2 adultos, cuando abre la lista, entonces ve "10 invitados · confirmados: 4 niños y 2 adultos".
- CA22 (R5.1, trabajadores): Dado el formulario de un invitado, cuando guarda solo el nombre y el tipo, entonces se guarda sin pedir teléfono ni correo.
- CA23 (R5.3, trabajadores): Dado el formulario de un invitado marcado como niño, cuando se revisa, entonces no hay campo de fecha de nacimiento ni de foto.
- CA24 (R5.4, trabajadores): Dado 15 nombres pegados, uno por línea, cuando los importa, entonces se crean 15 invitados con tipo adulto por defecto, que luego puede cambiar.
- CA25 (R5.5, trabajadores): Dado un cliente que no ha aceptado el aviso de datos, cuando intenta guardar su primer invitado, entonces se le muestra el aviso y no se guarda hasta que lo acepte.

**R6. Acceso y compartir**
- CA26 (R6.1, trabajadores): Dado un planificador, cuando alguien intenta abrirlo con un enlace con token (por ejemplo, el de su reserva) sin sesión, entonces se le pide iniciar sesión y no ve nada.
- CA27 (R6.2, trabajadores): Dado un visitante sin sesión, cuando intenta guardar un planificador, entonces se le pide iniciar sesión.
- CA28 (R6.3, trabajadores): Dado un co-organizador invitado, cuando inicia sesión con la cuenta invitada, entonces edita ítems y gastos; y cuando el dueño le quita el acceso, entonces ya no puede abrir el planificador.
- CA29 (R6.3, trabajadores): Dado una invitación enviada a un correo, cuando otra cuenta distinta usa el enlace de la invitación, entonces no obtiene acceso.
- CA30 (R6.4, trabajadores): Dado un planificador con 10 invitados, cuando el cliente exporta sin marcar "incluir nombres", entonces el documento muestra ítems, montos y "10 invitados", sin ningún nombre.
- CA31 (R6.5, trabajadores y locales): Dado dos tiendas con la capacidad, cuando un cliente de la tienda A consulta la API pidiendo datos de la tienda B, entonces recibe "no encontrado" y no ve nada.

**R7. Relación con la reserva**
- CA32 (R7.1, trabajadores): Dado un cliente sin ninguna reserva, cuando entra a "Planifica tu fiesta", entonces puede crear su planificador.
- CA33 (R7.2, trabajadores): Dado una reserva en la tienda, cuando el cliente abre la página de su reserva y pulsa "Planifica tu fiesta", entonces va a iniciar sesión y luego a su planificador; la página de la reserva no muestra datos del planificador.
- CA34 (R7.3, trabajadores): Dado un planificador vinculado a una reserva reconfirmada, cuando el cliente abre la lista, entonces ve el ítem "Animación" con fecha, hora y "reconfirmada", sin poder editarlo; y la agencia, en su panel, no ve ninguna información nueva del planificador.
- CA35 (R7.4, trabajadores): Dado una fiesta cuya fecha pasó hace 91 días, cuando se ejecuta la limpieza, entonces los invitados ya no existen y los ítems y montos siguen visibles en "Fiestas pasadas".
- CA36 (R7.5, trabajadores): Dado un planificador pasado, cuando pulsa "Usar para otra fiesta", entonces se crea uno nuevo con los mismos ítems y categorías en `pendiente`, sin montos ni invitados.

**R8. Datos personales**
- CA37 (R8.2, trabajadores): Dado el sistema en uso, cuando se revisan las consultas del panel de la tienda, del asistente de IA y de analítica, entonces ninguna incluye datos de invitados ni notas de un planificador.
- CA38 (R8.3, trabajadores): Dado un cliente con un planificador, cuando pulsa "Descargar mis datos", entonces recibe todo lo suyo; y cuando pulsa "Borrar todo", entonces nada queda accesible.
- CA39 (R8.4, trabajadores): Dado un invitado "Lucía Pérez", cuando se revisa el registro técnico de la operación, entonces el nombre no aparece.
- CA40 (R8.5, trabajadores): Dado una tienda que se elimina, cuando tenía planificadores de clientes, entonces los clientes reciben aviso y pueden exportar antes del borrado definitivo.

**R9. Capacidad por rubro**
- CA41 (R9.1/R9.3, productos): Dado una tienda de productos, cuando se navega por ella, entonces no hay menú, ruta, botón ni endpoint del planificador (la API responde "no encontrado").
- CA42 (R9.1, locales): Dado una tienda de locales que no activó la capacidad, cuando se navega por ella, entonces el comportamiento es el de siempre; y cuando la activa, entonces aparece "Planifica tu evento" con sus plantillas, sin cambiar cotización ni pagos.
- CA43 (R9.2, trabajadores): Dado el código del repo, cuando se corre `npm test`, entonces `scripts/anti-identidad.mjs` pasa: no hay comparaciones de rubro fuera de su carpeta ni del perfil.
- CA44 (R9.3, hotel): Dado una tienda de hotel, cuando el huésped abre su reserva, entonces no aparece "Planifica tu fiesta".

## Ideas evaluadas

Diego pidió "lo más completo posible". Lo completo se ordena en fases; esto es lo que decidí sobre cada idea y por qué.

| Idea | Valor para el cliente | Riesgo o costo | Decisión |
|---|---|---|---|
| Fecha límite o recordatorio por ítem | Alto: "pedir la torta 5 días antes" es lo que más se olvida. | Necesita el proceso programado de confianza-reserva (fase 2). Un correo recordatorio al cliente es dato personal, pero solo el suyo. | Fase 3. |
| Proveedor y su contacto por ítem | Medio: tener a mano el teléfono de la pastelería. | Guarda datos de terceros (comerciales, no sensibles). Puede crecer a un directorio. | Fase 3, solo nombre y teléfono como texto; sin directorio. |
| Adelanto pagado y saldo | Alto: "cuánto debo todavía". | Solo registra; no mueve dinero. Complica el modelo del monto. | Fase 3, junto con estimado y real. |
| Confirmación de asistencia | Alto: saber cuántos niños y adultos para pedir comida y sillas. | Marcado a mano por el cliente es seguro. Un enlace para que el invitado confirme crea un acceso público y recoge datos de más personas. | Marcado a mano en la fase 2. Enlace de confirmación (RSVP) en la fase 5, y solo si se valida. |
| Programa del día | Medio: la hora de cada cosa. | Se duplica con el itinerario de la agencia (R5.2 de servicios-a-domicilio). | Fase 5. Si se hace, el itinerario de la reserva se muestra como parte del programa, de la reserva al planificador. |
| Exportar o compartir la lista | Medio: llevar la lista de compras al supermercado, mostrarla a la pareja. | Un enlace reenviable con nombres es el riesgo central. | Fase 4: exportar sin nombres por defecto; la pareja entra como co-organizador con cuenta, no con enlace. |
| Co-organizador | Alto: lo organizan dos personas. | Control de acceso por cuenta; más superficie de error. | Fase 4. |
| Vincular la reserva | Alto: es lo que conecta con la agencia. | Debe ser un solo sentido (reserva a planificador). | Fase 4. |
| Reutilizar para la siguiente fiesta | Medio: fideliza. | Bajo. | Fase 4. |
| Importar invitados pegando nombres | Medio. | Bajo. | Fase 2. |
| Sugerencias con IA ("qué falta") | Posible, pero no pedido. | Costo, y mandar listas de invitados a un proveedor de IA. | Fuera de alcance; no se envían datos del planificador a IA (R8.2). |

## Fases

Lo mínimo útil va primero. Cada fase se prueba y se despliega antes de la siguiente.

| Fase | Qué entrega | Qué evita o decide |
|---|---|---|
| 0. Validar | Hablar con 5 mamás o papás que organizaron una fiesta en el último año (no solo con agencias): ¿qué usaron?, ¿qué les faltó?, ¿usarían esto si lo ofrece la agencia?, ¿se animarían a cargar invitados? Corre en paralelo a la fase 1 y decide el orden de las fases 2 a 5. | Que construyamos una lista de cosas que nadie va a usar. Ya existen muchas hojas de cálculo y aplicaciones gratuitas: lo que nos diferencia es la marca de la agencia y el vínculo con la reserva. |
| 1. Lo mínimo útil | Cuenta de cliente; planificador desde plantilla o en blanco (R1, R3); montos, total y presupuesto (R4); plantillas de la agencia y plantillas base (R2); capacidad en el perfil (R9); botón en la tienda y en la página de la reserva (R7.1, R7.2). | Sin invitados no hay datos de terceros: se puede lanzar sin resolver el tema legal de menores (R8). |
| 2. Invitados | Lista de invitados, totales, importar nombres, aviso de datos y borrado a los 90 días (R5, R8, R7.4). | **Antes de empezar**: revisión legal de P2 y política de privacidad lista. |
| 3. Orden y control | Fecha límite y recordatorio por ítem, proveedor y contacto como texto, estimado, adelanto y saldo (ideas evaluadas). | Depende de confianza-reserva fase 2 (recordatorios). |
| 4. Compartir y conectar | Co-organizador (R6.3), exportar (R6.4), vincular la reserva (R7.3), usar para otra fiesta (R7.5). | Es el vínculo con la agencia: va después de que el planificador ya sirva solo. |
| 5. Después (según validación) | Programa del día, enlace de confirmación de asistencia, activarlo en `locales`. | — |

## Variación por cliente

- **Configuración por tienda:** qué plantillas tiene activas (R2), nombre visible de la herramienta, si la capacidad está encendida.
- **Capacidad opcional del rubro:** el planificador es una capacidad común activable por tienda (R9). Encendida por defecto en `trabajadores`. Opcional en `locales`.
- **Excepción por tienda:** ninguna prevista.

## Fuera de alcance

- Que la agencia vea el planificador, sus ítems, gastos o invitados. Descartado por Diego, igual que ofrecer ítems con la marca "Lo ofrecemos".
- Que la agencia reciba la fecha, la cantidad de invitados o cualquier dato derivado del planificador. Salvo lo que decida Diego en P3 (recuento anónimo de uso de plantillas).
- Pagos reales a proveedores desde la plataforma, comprobantes o conciliación: el monto es un registro del cliente.
- Un directorio o marketplace de proveedores, o recomendar proveedores.
- Integración con tiendas (Plaza Vea, supermercados, pastelerías) o carrito de compra.
- Invitaciones digitales con diseño, o enviar mensajes o correos a los invitados desde la plataforma.
- Mesa de regalos, lista de deseos o colecta entre invitados.
- Asistente de IA que sugiera o complete el planificador (y enviar datos del planificador a IA).
- Fotos, archivos adjuntos o galería en los ítems.
- Aplicación móvil nativa.
- Otros idiomas que no sean el español en la primera versión.
- Planificador compartido entre tiendas: en la primera versión, un planificador vive en la tienda donde se creó (P8).

## Preguntas abiertas

Cada una trae mi recomendación. Las primeras cuatro cambian el alcance o el riesgo.

- [ ] **P1. Cómo entra el cliente.** Opciones: (a) la cuenta de cliente que ya existe (Google); (b) (a) más un acceso por correo con enlace de un solo uso; (c) un enlace con token como el de la reserva. **Recomiendo (a)** y evaluar (b) si la validación muestra que muchas mamás no usan Google. **Rechazo (c)**: el enlace de la reserva es reenviable y daría acceso a una lista de nombres de niños a quien lo reciba. Hay que verificar si la cuenta es global o por tienda (arquitecto).
- [ ] **P2. Quién es el responsable del tratamiento de datos (Ley 29733).** Mi lectura, **sin asesoría legal**: los datos de invitados son de terceros y a menudo menores. Aunque el cliente los carga para su uso familiar, quien los almacena y puede tocarlos es la plataforma, no la agencia (que no accede, así que no puede figurar como responsable como en las reservas). Parece que el responsable o encargado sería la plataforma, con una política de privacidad propia, aviso al cliente (R8.1) y, posiblemente, inscripción del banco de datos. **Recomiendo** hacer la fase 1 (sin invitados) y consultar a un abogado antes de empezar la fase 2. Pendiente de Diego: ¿quién firma como responsable?
- [ ] **P3. Qué ve la agencia.** Diego decidió que no ve el planificador. Queda la duda de cuánto valor percibirá la agencia si no ve nada. Opciones: (a) nada; (b) solo un número: cuántos planificadores se crearon con cada plantilla, sin identidad. **Recomiendo (b)**: la agencia sabe que la herramienta se usa y qué plantilla funciona, sin ver a nadie. Si Diego prefiere (a), no se construye.
- [ ] **P4. Capacidad común y dónde vive.** **Recomiendo capacidad común**, no una pieza del rubro `trabajadores`. Por qué: el modelo (planificador, ítems, montos, invitados) no depende de personal ni de agenda; `locales` (quinceañeros, bodas) tiene la misma necesidad; y el repo ya pide que el código compartido pregunte por capacidades. Eso cambia dónde vive en el código: un módulo común con el perfil de cada rubro aportando textos y plantillas base, en vez de `negocio/trabajadores/`. Alcance de la primera versión: solo `trabajadores`; `locales` lo activa solo después de validar.
- [ ] **P5. ¿Quién puede crear un planificador?** "La agencia lo ofrece como parte de su paquete" admite dos lecturas: (a) cualquier persona con cuenta, aun sin reservar (engancha antes de la compra); (b) solo quien reservó. **Recomiendo (a)**: es el gancho. Lo que sí queda solo para quien reservó es vincular la reserva (R7.3).
- [ ] **P6. ¿Es gratis para el cliente?** **Recomiendo** gratis para el cliente e incluido en el plan de la tienda. Si luego se cobra algo, sería a la tienda.
- [ ] **P7. Cuánto tiempo se guardan los invitados.** **Recomiendo** borrarlos a los 90 días de la fecha de la fiesta (o a los 12 meses si nunca se puso fecha), sin borrar los ítems ni los montos, y que el cliente pueda borrarlos antes. Que el cliente reactive la lista si organiza otro año.
- [ ] **P8. ¿Un planificador por tienda o por cliente?** **Recomiendo por tienda** en la primera versión (un planificador pertenece a la tienda donde se creó): es lo más seguro para el aislamiento entre tiendas. Si el cliente usa dos agencias tendrá dos listas separadas. Y qué pasa si la tienda se elimina: aviso y exportar (R8.5).
- [ ] **P9. Una cifra o estimado y real.** **Recomiendo** una cifra por ítem en la fase 1 y separar estimado, adelanto y saldo en la fase 3, cuando haya feedback.
- [ ] **P10. Menores.** **Recomiendo** guardar solo el nombre de pila y "niño"; sin fecha de nacimiento, sin fotos, sin teléfono. La edad del cumpleañero, si el cliente la quiere, va como nota libre.
- [ ] **P11. Nombre en la interfaz.** **Recomiendo** que lo defina el perfil del rubro: "Planifica tu fiesta" para `trabajadores/fiestas` y "Planifica tu evento" para `locales`.
- [ ] **P12. Validar con organizadores antes de la fase 2.** **Recomiendo** 5 conversaciones con quienes organizaron una fiesta en el último año, en paralelo a la fase 1.
- [ ] **P13. Acceso del equipo de la plataforma.** Los datos viven en nuestra base. **Recomiendo** que el equipo no los consulte salvo pedido del cliente para soporte, y que quede escrito en la política de privacidad.

## Decisiones tomadas

| Fecha | Decisión | Por qué | Alternativa descartada |
|---|---|---|---|
| 2026-10-20 | Se agrega el planificador de la fiesta como requerimiento propio, en esta spec | Nace de la fiesta de Diego (12 cosas, de las cuales la animación era una) y es independiente del rubro `trabajadores` y de confianza-reserva. | Meterlo como un requisito más de servicios-a-domicilio. |
| 2026-10-20 | La agencia ofrece el planificador como parte de su paquete | Para enganchar y fidelizar al cliente. | — |
| 2026-10-20 | La agencia arma sus plantillas (por ejemplo "Fiesta infantil completa"); la mamá, o quien organice, elige una y la edita, o arma su propia lista desde cero | Reduce el trabajo del cliente sin quitarle control. | Plantilla única de la plataforma sin edición. |
| 2026-10-20 | El planificador incluye checklist con notas, precio por ítem, control del gasto (total gastado y, si aplica, presupuesto) y lista de invitados | Es lo que necesita quien organiza. | — |
| 2026-10-20 | Se busca "lo más completo posible" para ayudar a quien organiza a tener todo bajo control, ordenado por fases | Lo mínimo útil primero; lo demás según validación. | Construir todo en la primera entrega. |
| 2026-10-20 | **El planificador es solo del cliente: la agencia no lo ve.** La agencia únicamente pone las plantillas | Decisión de Diego. Simplifica el diseño y reduce el riesgo de datos personales. | Que la agencia vea el planificador y ofrezca ítems con la marca "Lo ofrecemos" (propuesta del analista, descartada por Diego). |

## Para el manual

Borrador para el dueño de la agencia: "Regala a tus clientes una herramienta para organizar toda la fiesta, no solo la animación. Armas tus plantillas, por ejemplo 'Fiesta infantil completa', con la lista de cosas que suelen hacer falta. Tu cliente la elige, la ajusta a su fiesta y anota qué contrató, qué compró, cuánto gastó y quiénes vienen. Es solo de tu cliente: tú no ves su lista. Lo que ganas es que te recuerde cada vez que organiza."
