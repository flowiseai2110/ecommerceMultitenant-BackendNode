# Simulación de rentabilidad: 10 eventos en Perú

> Parte de [spec.md](spec.md). Script: [simulacion.py](simulacion.py) (`python3 simulacion.py`; semilla fija, resultados reproducibles).
> Fecha: 2026-10-06. Tipo de cambio supuesto: **S/ 3.45 por dólar**.

## Supuestos

**Invitados virtuales:** por cada minuto del evento se simula cuántos invitados están conectados:
- Los primeros 20 min van llegando (del 15 % al 45 %).
- Durante el evento, alrededor del **40 %** está conectado.
- En los **momentos clave** (la torta, el vals, la ceremonia, la misa) sube al **70–85 %**.
- En el último 15 % del evento se van yendo.
- ±10 % de variación al azar por minuto.

**Equipos:** 70 % ve en el celular (720p) y 30 % en TV o computadora (1080p).

**Repetición:** en Privado, el 40 % de los invitados ve 25 min de la grabación; en Premium, el 50 % ve 40 min.

**Costos (USD):** Mux encoding $0.032/min, entrega $0.0008 (720p) y $0.001 (1080p) por minuto visto, retransmisión $0.02/min por destino y almacenamiento $0.003/min al mes. Cloudflare R2 a $0.015/GB al mes. Mux Robots dentro de sus 100k unidades gratis. Las vistas en Facebook y YouTube no le cuestan a la plataforma.

**Precios de la plataforma a la tienda (S/, sin IGV):**

| Concepto | Precio |
|---|---|
| Hora de transmisión (paquete; hasta 50 invitados = 1 h) | S/ 25 |
| Hora de excedente | S/ 35 |
| Premium (IA + 90 días + descarga por 1 año) | S/ 40 por evento |
| Retransmisión | S/ 8 por hora y por destino |
| Guardar 1 año | S/ 50 |
| Básico (YouTube) | Incluido en el plan |

**Precio de la tienda a su cliente** (basado en el mercado de Lima: S/ 250–500 por 2–3 h y S/ 100–150 por hora extra):
- S/ 250 por las primeras 2 h, más S/ 100 por cada hora extra.
- Premium: +S/ 150. Guardar 1 año: +S/ 80. Básico: S/ 60.

## Resultados por evento

| # | Evento | Ciudad | Plan | Horas | Invitados | Pico conectados | Minutos vistos | Costo plataforma | Cobro a la tienda | Margen plataforma | Cobro al cliente | Gana la tienda |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cumpleaños 2 años de Mateo | Lima (Los Olivos) | Privado | 3 | 32 | 29 | 2,618 | S/ 30.80 | S/ 75.00 | 59 % | S/ 350 | S/ 275.00 |
| 2 | Baby shower de Ana | Arequipa | Privado | 2 | 18 | 15 | 956 | S/ 18.09 | S/ 35.00 | 48 % | S/ 250 | S/ 215.00 |
| 3 | Quinceañero de Valeria (+ Facebook y YouTube) | Trujillo | Premium | 5 | 85 | 78 | 11,632 | S/ 130.38 | S/ 320.00 | 59 % | S/ 700 | S/ 380.00 |
| 4 | Boda de Lucía y Diego (+1 h de excedente, Facebook y YouTube, guardar 1 año) | Cusco | Premium | 7 | 140 | 131 | 27,455 | S/ 256.76 | S/ 720.00 | 64 % | S/ 980 | S/ 260.00 |
| 5 | Bautizo de Thiago | Huancayo | Básico | 2 | 25 | — | — | S/ 0 | S/ 0 | — | S/ 60 | S/ 60.00 |
| 6 | Misa de honras de Don Julio (guardar 1 año) | Piura | Privado | 2 | 70 | 65 | 5,085 | S/ 48.32 | S/ 130.00 | 63 % | S/ 330 | S/ 200.00 |
| 7 | Fiesta de promoción del colegio (+ YouTube) | Lima (Surco) | Premium | 4 | 170 | 140 | 18,365 | S/ 120.67 | S/ 352.00 | 66 % | S/ 600 | S/ 248.00 |
| 8 | Bodas de oro de los abuelos (+30 min, guardar 1 año) | Chiclayo | Privado | 4.5 | 45 | 42 | 5,628 | S/ 88.13 | S/ 167.50 | 47 % | S/ 580 | S/ 412.50 |
| 9 | Primera comunión de Camila | Ica | Privado | 2 | 35 | 31 | 2,158 | S/ 22.16 | S/ 50.00 | 56 % | S/ 250 | S/ 200.00 |
| 10 | Fiesta patronal Virgen de la Candelaria (+30 min) | Puno | Privado | 4.5 | 95 | 73 | 11,205 | S/ 69.19 | S/ 188.00 | 63 % | S/ 500 | S/ 312.00 |

El costo por evento es el **peor caso** (sin la capa gratis de Mux) y, en los eventos con "guardar 1 año", incluye guardar la grabación 1 año en Mux.

## Totales del mes

| | Sin capa gratis de Mux (a escala) | Con capa gratis (los primeros meses) |
|---|---|---|
| Ingreso de la plataforma | S/ 2,037.50 | S/ 2,037.50 |
| Costo (Mux + R2) | S/ 784.51 ($227.39) | S/ 430.82 ($124.88) |
| **Ganancia bruta** | **S/ 1,252.99** | **S/ 1,606.68** |
| **Margen** | **61.5 %** | **78.9 %** |

- Minutos entregados en el mes (en vivo + repetición): **95,952**. Los 10 eventos casi llenan los **100k minutos gratis** de Mux: a partir del evento 11 del mes, cada evento cuesta lo del peor caso.
- La parte de las **tiendas** suma **S/ 2,562.50**: ganan más que la plataforma, lo que ayuda a que adopten el servicio.
- En qué se va el costo (USD): entrega $82.52 · encoding $65.28 · almacenamiento en Mux $36.49 · retransmisión $33.60 · R2 $9.50.

## Hallazgos

1. **Es rentable en todos los eventos.** El margen va de 47 % a 66 % en el peor caso, y ningún evento da pérdida.
2. **Los dos márgenes más bajos tienen causas distintas:**
   - **Bodas de oro (47 %):** guardar la grabación **1 año en Mux** cuesta unos $10. **Decisión:** "Guardar 1 año" alarga solo la **descarga en R2** ($1.22), no la grabación en línea. Ya está en el spec.
   - **Baby shower (48 %):** los eventos chicos pesan más por el encoding, que es un costo fijo por minuto ($1.92/h) aunque haya pocos invitados. Aun así deja ganancia.
3. **La retransmisión se cobra por hora y por destino** (S/ 8), no como precio fijo. En la boda de 7 h a 2 destinos cuesta $16.80. Con un precio fijo dentro del Premium, se perdería dinero en los eventos largos.
4. **Los eventos grandes y largos son los más caros para la tienda.** La boda de 140 invitados y 7 h le cuesta S/ 720. Ahí el factor de 2.8 (hasta 200 invitados) pesa mucho. Si la tienda cobra menos de unos S/ 900, pierde. Conviene que el admin le muestre a la tienda el costo **antes** de cotizarle al cliente.
5. **Hay que vigilar los 100k minutos al mes.** Pasado ese volumen, el margen baja del 79 % al 62 %, pero sigue alto.

## Lo que no incluye

- **IGV (18 %):** los precios están sin IGV.
- Comisión de la pasarela si la tienda paga con tarjeta (≈ 3–4 %).
- Costo de desarrollo, soporte y una posible cuota mensual de Mux (por verificar).
- Mensajes de WhatsApp: las invitaciones usan `wa.me`, sin costo. Los avisos automáticos de los 15 minutos por WhatsApp Business sí tendrían un costo por mensaje.
- Variaciones del tipo de cambio: el costo está en dólares y el ingreso en soles.

## Fuentes

- Precios del mercado de Lima: [Video y Foto para Bodas](https://www.videoyfotoparabodas.com/transmisionenvivoparabodas), [Pop Comunicaciones](https://popcomunicaciones.com/streaming-para-eventos-en-lima-y-todo-el-peru/), [livestreaming.pe](https://livestreaming.pe/).
- Tipo de cambio de referencia: [La Cámara, 14 de agosto de 2026](https://lacamara.pe/precio-del-dolar-en-peru-hoy-14-de-agosto-de-2026/).
- Costos de Mux, Cloudflare y R2: ver [spec.md](spec.md#fuentes).

---

# Casos reales por tipo de evento (2026-10-06)

> Script: [casos.py](casos.py). Mismos supuestos de costo. Comisiones de pasarela: Culqi con Yape 2.99 % + S/ 0.30, con tarjeta 3.99 % + S/ 0.60, más IGV; mezcla supuesta de 80 % Yape y 20 % tarjeta.

| Caso | Quién paga | Modelo | Costo de video (Mux) | Costo (Cloudflare) | La plataforma cobra | Margen (Mux / Cloudflare) | Gana la tienda u organizador |
|---|---|---|---|---|---|---|---|
| Cumpleaños 1 h, 15 invitados | Los padres | Paquete S/ 49 | S/ 9.11 | S/ 3.21 | S/ 15 | 39 % / 79 % | S/ 34 |
| Cumpleaños 2 h, 15 invitados | Los padres | Paquete S/ 79 | S/ 17.96 | S/ 6.11 | S/ 25 | 28 % / 76 % | S/ 54 |
| Cumpleaños 2 h, 25 invitados | Los padres | Paquete S/ 99 | S/ 20.28 | S/ 8.80 | S/ 30 | 32 % / 71 % | S/ 69 |
| Boda (simulación anterior) | Padrinos y esposos | Premium con videógrafo | S/ 256.76 | — | S/ 720 | 64 % | S/ 280–380 |
| Promoción 4 h, 60 invitados virtuales | Cada familia, dentro de la cuota | S/ 10 por invitado | S/ 54.61 | — | S/ 3 por invitado (S/ 180) | 70 % | S/ 420 |
| Deporte escolar 2 h, 80 compras | Cada padre | Ticket S/ 4 | S/ 34.43 | — | 25 % del ticket (S/ 80) | 57 % | S/ 194 (colegio) |
| Cancha: video del partido + jugadas, 1 mes | El equipo o la empresa | S/ 50 por video | S/ 8.91 | S/ 2.97 | S/ 15 | 41 % / 80 % | S/ 35 (cancha) |

## Hallazgos de los casos reales

1. **Los eventos chicos cambian la elección del proveedor.** Con 15 invitados durante 1–2 h, casi todo el costo de Mux es el **encoding** ($1.92 por hora), que se paga aunque haya pocos invitados. Cloudflare no cobra encoding y sale **unas 3 veces más barato**. El crédito de $20 al mes de Mux solo cubre unas 10 horas.
2. **Ticket de S/ 4:** la comisión de la pasarela se lleva **unos S/ 0.58 (14 %)**, por la parte fija de cada pago. Con S/ 5 baja a 12 %. Un **abono de temporada** (8 partidos por S/ 28) la baja a 5 %. Además se necesita Yape **automático** (Culqi): 80 pagos de S/ 4 no se pueden verificar a mano.
3. **Promoción a S/ 10 por invitado:** es el caso más rentable (62–76 %) y el más fácil de vender, porque va dentro de la cuota del evento.
4. **Cancha:** no necesita transmisión en vivo, solo grabar y guardar. Ya hay competencia especializada con cámaras fijas: FútbolREC (Perú), Beelup (17 países), Signal Play. Encaja mejor como **otro tipo de negocio** (canchas) que dentro de eventos.
