# Índice de diseños

> La copia en el repo es la fuente de verdad; el enlace de claude.ai es solo donde se dibujó.
> Reglas de esta carpeta: [README.md](README.md). Rescate inicial: 2026-10-18.

## Vigentes

| Diseño | Funcionalidad (spec) | Pantallas | Versión vigente | Original (claude.ai) | Implementado |
|---|---|---|---|---|---|
| Plantillas estándar por rubro | [plantillas-por-rubro](../specs/plantillas-por-rubro/spec.md) | Tienda · 6 rubros × 6 pantallas, móvil y desktop | [v1 2026-10-13](plantillas-por-rubro/v1-2026-10-13/vista/) (fuente editable en `fuente/`) | [lienzo](https://claude.ai/artifact/VUn82KP1ALcqC2HLzv7Gpk) | No (falta mapeo pantalla por pantalla) |
| Reservas Hotel Nobility | [ciclo-reserva-hotel](../specs/ciclo-reserva-hotel/spec.md) | Admin · reservas del hotel | [v1 2026-10-17](reservas-hotel-nobility/v1-2026-10-17.html) | [prototipo](https://claude.ai/artifact/XEDKSa6GfScKGMtJVyGbut) | Parcial (piezas 1-3) |
| Dashboard por rubro | [dashboard-por-rubro](../specs/dashboard-por-rubro/spec.md) | Admin · dashboard de los 6 rubros | [v1 2026-10-12](dashboard-por-rubro/v1-2026-10-12.html) | [maquetas](https://claude.ai/artifact/21v34bNa5RVRKwNWj9X1jz) | Por verificar |
| Nuevo editor de Diseño (opción A elegida) | [editor-diseno-en-vivo](../specs/editor-diseno-en-vivo/spec.md) | Admin · editor | [v1 2026-10-12](nuevo-editor-diseno/v1-2026-10-12.html) | [propuestas](https://claude.ai/artifact/7rNJojVewHZMc6MebjWNHz) | Sí (fases 1-2) |
| Editor A · Los Cedros | [editor-diseno-en-vivo](../specs/editor-diseno-en-vivo/spec.md) | Admin · editor con canchas | [v1 2026-10-12](editor-a-los-cedros/v1-2026-10-12.html) | [ejemplo](https://claude.ai/artifact/RkiwZVaqtx2ZYAqCxzQ7fW) | Sí |
| Tres plantillas para canchas | [plantillas-canchas](../specs/plantillas-canchas/spec.md) | Tienda · canchas | [v1 2026-10-12](plantillas-canchas/v1-2026-10-12.html) | [propuesta](https://claude.ai/artifact/7KTkVF44E3cDRpZAarfNXw) | Sí |
| Cancha Los Cedros | [alquiler-canchas](../specs/alquiler-canchas/spec.md) | Tienda · vista del cliente | [v1 2026-10-12](cancha-los-cedros/v1-2026-10-12.html) | [maqueta](https://claude.ai/artifact/1pvieL2mWPLwB4XYJHwb98) | Sí |
| Propuestas de calendario | [selector-fechas](../specs/selector-fechas/spec.md) | Tienda · selector de fechas (propuestas 0–4 + mapa de uso) | [v1](selector-fechas/v1.html) | [prototipo](https://claude.ai/artifact/MGNhGAvQ1HfgtXVJdYazkd) | Por verificar |
| Campañas: el cuándo (Fase 1) | [campanas-cuando](../specs/campanas-cuando/spec.md) | Admin · Campañas (horas, fechas de uso, Cyber Wow) y Plataforma · fechas por año; Tienda · portada, selectores de fecha de los 5 rubros con reserva, cambio con pestaña abierta | [v1 2026-10-19](campanas-cuando/v1-2026-10-19.html) (aprobado 2026-10-19) | — (dibujado en el repo) | No |
| Campañas en 3 pasos y promoción de precios | [campanas-descuento](../specs/campanas-descuento/spec.md) (borrador) | Admin · Campañas (centro de 3 pasos, paso 3 con alcance en lote, confirmación), productos y cupones; Tienda · listado, ficha, carrito y pago con precio de campaña | [v1 2026-10-20](campanas-descuento/v1-2026-10-20.html) (aprobado 2026-10-20) | — (dibujado en el repo; parte de campanas-cuando v1) | No |

"Implementado" sale de la memoria de sesiones anteriores: confirmarlo con el `qa`.

## Falta rescatar

| Diseño | Spec | Por qué falta |
|---|---|---|
| Mockup de efectos festivos | [efectos-festivos](../specs/efectos-festivos/spec.md) | La descarga automática fue bloqueada. Abrir [el enlace](https://claude.ai/artifact/Kp7Enc78bLPhtPPFC6xLTt), descargar el HTML y guardarlo en `efectos-festivos/v1.html` |
| Proyectos de claude.ai/design | — | No se ven desde Claude Code. Revisar la lista en claude.ai/design y exportarlos con "Handoff to Claude Code" |

## Documentos de análisis (no son diseños, ya están en el repo)

| Documento | Copia en el repo | Original |
|---|---|---|
| Casos de uso — Alquiler de locales | [alquiler-locales/casos-de-uso.md](../specs/alquiler-locales/casos-de-uso.md) | [doc](https://claude.ai/artifact/TFac7UsSYAsNBwZcjfUncx) |
| Agente de ventas IA | [specs/Agente de ventas IA….md](../specs/Agente%20de%20ventas%20IA%20para%20ecommerce%20an%C3%A1lisis%20y%20arquitectura.md) | [doc](https://claude.ai/artifact/D8PS2GYcpMfb9bzLgbJFAc) |

## Reemplazados / descartados

| Diseño | Reemplazado por | Fecha | Por qué |
|---|---|---|---|
