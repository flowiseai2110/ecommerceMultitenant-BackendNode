# ADR-0002: La campaña es una sola cosa, en tres pasos: Cuándo, Cómo se verá, Promoción

- **Estado:** aceptada
- **Fecha:** 2026-10-20
- **Decide:** Diego
- **Reemplaza:** la regla "Campañas es el cuándo; Diseño es el cómo" (campanas-widgets/cambios.md, 2026-10-19)
- **Relacionadas:** [campanas-descuento](../specs/campanas-descuento/spec.md) · [campanas-cuando](../specs/campanas-cuando/spec.md) · [ADR-0001](ADR-0001-precio-calculado-en-servidor.md)

## Contexto

- Hoy una campaña está repartida: el cuándo está en Admin › Campañas, el aspecto en Admin › Diseño (modo campaña) y la promoción no existe.
- El dueño piensa "voy a armar mi Black Friday", no "voy a tres pantallas". Launchpad de Shopify reúne en un evento las fechas, el tema y los descuentos.
- Con la promoción real (ADR-0001), la campaña pasa a tocar precios: tiene que verse completa antes de activarla.

## Decisión

1. **Admin › Campañas es el centro de la campaña.** Al abrir una, se ven tres pasos con su estado:
   - **1. Cuándo:** fechas oficiales o "Mis fechas", horas, días antes y después, fechas de uso.
   - **2. Cómo se verá:** vista previa y "Editar aspecto", que abre el **mismo** editor en vivo de Diseño en modo campaña. El editor no se duplica.
   - **3. Promoción** (opcional): alcance, porcentaje y cupón, con confirmación explícita.
2. **Un solo CTA, "Activar campaña",** habilitado con el paso 1 listo.
3. **Cada dato vive en un solo lugar:** las fechas en el paso 1, el aspecto en el editor de Diseño y la promoción en el paso 3.
4. **Las validaciones de sentido común (campanas-cuando R8) se mantienen y se cruzan entre pasos:** por ejemplo, si la portada promete un descuento y el paso 3 está vacío, se avisa.

## Consecuencias

- El dueño arma y revisa la campaña completa en un lugar. Es más difícil activar una campaña a medias.
- Diseño deja de ser una puerta de entrada a las campañas y pasa a ser su herramienta de aspecto. El selector de campañas de Diseño se mantiene para llegar directo al editor.
- El rediseño de la pantalla de Campañas pasa por el `disenador`.

## Alternativas descartadas

- **Mantener las tres pantallas separadas** (como Tiendanube, donde las promociones son un módulo aparte): obliga al dueño a coordinar fechas a mano entre pantallas y repite datos.
- **Un asistente rígido paso a paso solo para crear:** sirve la primera vez, pero editar una campaña ya creada necesita ver los tres pasos juntos.
