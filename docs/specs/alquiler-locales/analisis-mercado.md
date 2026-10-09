# Análisis de mercado: alquiler de locales para eventos en Perú

> Investigación de escritorio (2026-10-09) que da origen a [spec.md](spec.md). Las fuentes son sobre todo páginas comerciales de locales, portales y vistas de TikTok: describen cómo opera el mercado, no son estadística. Lo marcado **[inferencia]** no viene de una fuente.

## Tres modelos de local

| Modelo | Qué vende | Ejemplo |
|---|---|---|
| Solo local | Espacio con lo básico: mesas, sillas, cocina, barra, a veces sonido para DJ | Los Olivos, 350 m², hasta 350 personas, S/ 2,700 ([Adondevivir](https://www.adondevivir.com/propiedades/clasificado/alcllcin--el-lugar-perfecto-para-tu-proximo-gran-evento-existe-150661561.html)) |
| Local con paquete todo incluido | Local + decoración + buffet + barra + DJ + hora loca + foto y video | La Fábrica de Eventos (SJL), paquete XV años desde S/ 8,500 ([sitio](https://lafabricadeeventos.com/salones-de-eventos-en-san-juan-de-lurigancho/)) |
| Espacio por horas | Uso del espacio por hora | Localy: S/ 150–800 por hora según distrito ([guía 2026](https://www.localy.lat/blog/cuanto-cuesta-alquilar-salon-eventos-lima-2026)); auditorio municipal de Santa Anita: S/ 500/h o S/ 2,500 por 6 h ([gob.pe](https://www.gob.pe/55277-alquilar-el-teatro-auditorio-municipal)) |

## 1. Cómo llegan los clientes

- **TikTok** es el canal más visible: videos del local con precio o promoción, distrito visible, urgencia ("fechas limitadas") y WhatsApp con "escribe *vengo de TikTok*" ([ejemplo](https://www.tiktok.com/discover/locales-para-15-a%C3%B1os-lima-baratos), [ejemplo](https://www.tiktok.com/discover/locales-para-fiesta-promocion-en-lima)).
- **WhatsApp** es donde se cierra la venta.
- **Portales:** Adondevivir, Urbania, Nuroa, MercadoLibre ([listado](https://listado.mercadolibre.com.pe/alquiler-de-local-para-eventos)).
- **Directorios:** ineventos ([Lima](https://www.ineventos.com/pe/locales-para-eventos/lima)) y Localy, que nace porque la búsqueda dependía de "información dispersa en redes sociales y recomendaciones aisladas" ([El Peruano](https://www.elperuano.pe/noticia/292859-emprendedora-peruana-impulsa-red-digital-de-locaciones-para-eventos)).
- **Web propia con contenido para Google** en los locales grandes ([Fundo Cinco Olivos](https://fundocincoolivos.com.pe/blog-cuanto-cuesta-quinceanero-lima)).
- **Promociones escolares:** se vende al comité de padres ([LJP Graduaciones](https://www.facebook.com/ljp.graduaciones/), [guía](https://www.clasevirtual.net/fiesta-de-promocion/)).
- Sin evidencia encontrada: Locanto y Facebook Marketplace. **[inferencia]** El cartel en la fachada y el boca a boca siguen pesando en Lima Norte y Sur.

**Impacto en la spec:** canal de origen en la cotización (R4.5), links compartibles por WhatsApp, reporte por canal (R12.5).

## 2. Paquete, promoción o precio fijo

- Solo local: precio fijo por evento (S/ 2,000–3,000 en Lima Norte).
- Por hora: S/ 300–800 por hora para 50–150 personas.
- Paquetes por número de invitados: quinceaños todo incluido para 100–150 invitados, S/ 15,000–25,000 ([fuente](https://fundocincoolivos.com.pe/blog-cuanto-cuesta-quinceanero-lima)).
- Precio por persona en catering y barra (hasta ~S/ 130).
- Promoción escolar por alumno: S/ 500–800 en secundaria; paquetes desde 10–15 alumnos ([fuente](https://www.clasevirtual.net/fiesta-de-promocion/)).
- Promociones por día (viernes y domingo más baratos que sábado), por reserva anticipada y de lanzamiento.
- Temporada: en bodas, alta de mayo a noviembre; diciembre y enero–marzo negociables ([fuente](https://cuantomecuesta.com/pe/boda-matrimonio/)).

**Impacto:** precios por día de la semana y feriado (R2.6), temporadas, paquetes fijos o por persona con mínimos (R2.5), cupones.

## 3. ¿El dueño contrata organizadores?

- Locales con productora propia o asociada y catering exclusivo (Fundo Cinco Olivos con Gala Eventos, [FAQ](https://fundocincoolivos.com.pe/preguntas-frecuentes)).
- Locales que aceptan proveedores externos con **tarifa de coordinación**, recargo de seguridad y limpieza, o **descorche**.
- En "solo local", el dueño no organiza nada.

**Impacto:** reglas de proveedores externos, tarifa de coordinación y descorche (R1.2, R11.3).

## 4. ¿El cliente organiza comida, bebida y animación?

- En solo local y por horas, sí: contrata catering, torta, DJ (por ejemplo S/ 350 por 5 h), hora loca, menaje y mozos.
- En paquete, solo elige opciones.
- En promociones, el comité contrata una productora o arma todo por separado.

**Impacto:** modalidades `solo_local`, `paquete`, `por_horas` (R2.5).

## 5. Cómo se paga

- **Separación** con monto fijo ("separa tu fecha con S/ 500") o **adelanto del 30–50 %** al firmar; la fecha se bloquea solo al pagar.
- **Saldo** antes del evento, a veces en cuotas hasta 30 días antes ([Fundo Cinco Olivos](https://fundocincoolivos.com.pe/preguntas-frecuentes)). No se encontraron casos de pago completo al final.
- **Garantía por daños**, devuelta después de revisar el local.
- Adelanto **no reembolsable** como regla común; algunos permiten reprogramar.
- Cargos posteriores: horas extra (sujetas a ordenanza municipal), daños, limpieza.
- Medios: transferencia, Yape, Plin.
- El contrato fija aforo, fecha, horario, tipo de evento, adelanto, fecha del saldo y garantía ([modelo](https://modelo.pe/contrato-de-alquiler-de-local-para-eventos/)).

**Impacto:** plan de pagos con cuotas (R7), garantía y liquidación (R11), contrato (R8), política por tramos (R10).

## Otros hallazgos

- **Licencias:** licencia de funcionamiento e ITSE emitidos por la municipalidad distrital; ordenanzas de ruido y multas por exceso de horario o aforo ([guía ITSE](https://tramitesperu.com/municipalidades/certificado-defensa-civil/)). **Impacto:** aforo de la licencia como tope (R2.2) y hora tope (R1.2).
- **Información dispersa** como problema central del mercado (Localy, tesis PUCP en el [repositorio](https://repositorio.pucp.edu.pe/index/handle/123456789/172896?show=full)).
- **Condiciones contradictorias** incluso en un mismo local: confirma que todo se negocia por WhatsApp y que el contrato aceptado es necesario.

## Por validar con dueños de locales

1. Uso real de Locanto y Facebook Marketplace.
2. Montos habituales de descorche y tarifa de coordinación.
3. Temporada alta de las fiestas de promoción (**[inferencia]** noviembre–diciembre).
4. Si la garantía se cobra en efectivo el mismo día o con anticipación.
</content>
</invoke>
