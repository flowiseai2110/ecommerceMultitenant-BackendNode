# Spec: efectos festivos y rediseño de Campañas

> Estado: **en implementación**. Ver [tasks.md](tasks.md).
> Diseño técnico y patrones: [plan.md](plan.md).
> Repos involucrados: BackendNode, FrontendAdmin, FrontendStore.
> Extiende: [campanas-widgets](../campanas-widgets/spec.md). Mockup aprobado: claude.ai/artifact/Kp7Enc78bLPhtPPFC6xLTt.

## Problema

1. Las campañas cambian colores, textos y adornos, pero el día que más importa (Navidad, Año Nuevo) la tienda no "celebra": no hay un momento especial al entrar.
2. La pantalla de Campañas se siente desconectada de Diseño: la campaña se edita en un formulario sin ver la tienda, los mismos campos (anuncio, portada, colores) existen en los dos lugares, Diseño no avisa que una campaña está tapando su diseño y los "widgets de siempre" (de todo el año) viven en Campañas.

## Objetivo

- Cada campaña puede tener un **efecto festivo** (nieve, fuegos artificiales, confeti...) y un **saludo** que el cliente ve al entrar a la tienda, una vez por visita.
- **Campañas decide cuándo; Diseño decide cómo se ve.** Campañas queda como el calendario del año con los efectos; el aspecto de cada campaña se edita en el editor en vivo de Diseño, en "modo campaña".
- El editor de Diseño actual no pierde ninguna función.

## Conceptos

- **Efecto:** animación decorativa sobre la tienda, de un catálogo cerrado de la plataforma.
- **Día clave del efecto:** los días en que el efecto se muestra por defecto (Navidad: 24 y 25 dic). Se declaran en el preset como desplazamientos desde su fecha clave.
- **Modo del efecto:** `clave` (solo el día clave, por defecto) o `campana` (toda la ventana de la campaña).
- **Modo de edición de Diseño:** "Mi tienda" (el diseño de todo el año) o una campaña.

## Alcance

**Incluye**
- Catálogo de efectos: nieve, fuegos artificiales, globos y confeti, confeti de colores, confeti rojo y blanco, corazones, pétalos, murciélagos, lluvia de ofertas, estrellas y "sin efecto".
- Efecto, modo y saludo por campaña (presets y propias), con valores por defecto en cada preset.
- Preset nuevo **Año Nuevo** (31 dic, fuegos artificiales).
- Rediseño de la página Campañas: calendario visual del año y detalle con el efecto.
- Modo campaña en Diseño: selector "Editando", partes editables y heredadas, vista previa en vivo con la campaña y el efecto.
- Los "widgets de siempre" pasan a Diseño → Encabezado.

**No incluye**
- Saludos personalizados por cliente (cumpleaños u otros): **descartado**. No se piden ni se guardan datos personales del comprador (Ley 29733).
- Que una campaña cambie el orden o la visibilidad de las secciones (decisión del 2026-10-14: las secciones siempre son las de Mi tienda).
- Imagen de portada por campaña, sonido.

## Requisitos

Formato: *Cuando [condición], el sistema debe [comportamiento].*

### E1 — Catálogo y configuración
- **E1.1** Los efectos son una lista cerrada definida en el backend (`EFECTOS`). El admin la recibe del API; no mantiene su copia.
- **E1.2** Cada preset declara su efecto, sus días clave (`diasEfecto`, desplazamientos desde la fecha clave) y su saludo por defecto.
  - Criterio: Navidad → `nieve`, 24–25 dic, "¡Feliz Navidad!". Año Nuevo → `fuegos`, 31 dic–1 ene.
- **E1.3** La tienda puede cambiar el efecto (incluido "sin efecto"), el modo (`clave` o `campana`) y el saludo (máximo 80 caracteres; vacío = sin saludo). Lo que no cambie se toma del preset.
- **E1.4** Una campaña propia empieza sin efecto; si el dueño elige uno, en modo `clave` se muestra el día de su fecha de fin (su fecha clave).

### E2 — Resolución
- **E2.1** `GET /store/tiendas?slug=` incluye `diseno.campana.efecto = { tipo, saludo }` **solo** si, en hora de Lima, hoy cae en la ventana del efecto; si no, `efecto: null`. El storefront no calcula fechas.
- **E2.2** La ventana del efecto en modo `clave` va de las 00:00 del primer día clave al final del último, recortada a la ventana de la campaña. En modo `campana` es la ventana de la campaña.
  - Criterio: Navidad con `despuesDias: 0`, 25 dic 12:00 → nieve; 26 dic → sin campaña. Navidad, 20 dic → campaña sin efecto.
- **E2.3** Con `tipo: "ninguno"` y sin saludo, `efecto` es `null`.

### E3 — Storefront
- **E3.1** Al entrar a la tienda, si la campaña trae efecto, se reproduce una vez sobre la página (unos 8 s) y se muestra el saludo, si hay.
- **E3.2** Una vez por visita: no se repite al navegar dentro de la tienda ni al recargar en la misma pestaña (`sessionStorage`, por tienda, campaña, efecto y año).
- **E3.3** No se muestra en carrito, checkout, rastreo ni libro de reclamaciones.
- **E3.4** Con `prefers-reduced-motion` o un tipo desconocido se muestra solo el saludo, sin animación ni errores.
- **E3.5** El efecto no bloquea la página: no captura clics, se cierra solo y el saludo tiene botón para cerrarlo.
- **E3.6** El código de cada efecto se descarga solo cuando se usa.

### E4 — Admin: Campañas
- **E4.1** Calendario del año: una barra por campaña en su ventana (apagadas rayadas), marca en los días del efecto, línea de hoy, etiquetas "En curso", "Empieza en N días", "Sugerida para tu rubro", "Personalizada".
- **E4.2** Resumen del día: qué ve hoy el cliente o cuál es la próxima campaña y su efecto.
- **E4.3** Detalle de cada campaña: efecto con vista previa, modo del efecto, anticipación, saludo, "Editar cómo se ve" (abre Diseño en modo campaña) y "Restablecer"/"Eliminar".
- **E4.4** Campañas propias: se crean con nombre e inicio/fin desde Campañas.

### E5 — Admin: Diseño en modo campaña
- **E5.1** Un selector "Editando" en la barra del editor: "Mi tienda" y las campañas (activas y apagadas). `/diseno?campana=<id>` abre directo esa campaña.
- **E5.2** Con "Mi tienda", el editor funciona exactamente igual que hoy, más los adornos de todo el año en Encabezado y un aviso si una campaña empieza en los próximos 30 días o está en curso.
- **E5.3** En modo campaña se pueden editar: colores, barra de anuncios, textos de la portada, cinta, cuenta regresiva, adornos y efecto con saludo. Encabezado, secciones y pie se ven pero no se editan ("De Mi tienda"). La pestaña de la ficha no se muestra.
- **E5.4** La vista previa dibuja la campaña con el mismo código del storefront en producción y permite ver el efecto.
- **E5.5** Cada parte cambiada respecto del preset se marca "Cambiado" y se puede restablecer.
- **E5.6** Deshacer, Rehacer y Publicar funcionan igual en los dos modos.

## Riesgos y notas

- La caché pública de `/store/tiendas` (5 min) puede retrasar el inicio del efecto a las 00:00 hasta 5 minutos. Aceptable.
- Rendimiento: los efectos usan un canvas con partículas acotadas por área y se detienen solos; no corren en el servidor (SSR).
