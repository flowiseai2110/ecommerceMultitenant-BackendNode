# Diseño: <funcionalidad>

> Spec: [spec.md](spec.md) · Estado: borrador

## Flujo
<Pasos del usuario (cliente final o dueño de tienda), por rubro si difiere.>

## Pantallas
### <Pantalla> — <Tienda | Admin>
- Objetivo de la pantalla (una frase)
- Contenido, en orden de importancia
- CTA principal (uno a la vista) y secundarios
- Mobile / desktop: qué cambia
- Estados: cargando · vacío · error · éxito · sin permisos
- Pieza de slot por rubro (`<app-slot-rubro pieza="…">`) si la estructura cambia entre rubros

## Textos
<Textos que cambian por rubro → van al perfil del rubro, no a la plantilla.>

## Checklist de reglas de la casa
- [ ] Sin información duplicada en la misma pantalla
- [ ] Un solo CTA principal a la vista; barra fija solo si el botón sale de pantalla
- [ ] Header siempre visible en mobile (cuenta e idioma)
- [ ] UI automática / responsive, sin toggles de vista
- [ ] Accesibilidad: contraste, foco visible, etiquetas, objetivos táctiles ≥ 44 px
- [ ] Nada dependiente del rubro fuera de un slot (SSR)

## Prototipo
- Parte de: <versión vigente en `docs/disenos/INDICE.md`, o "nuevo">
- Copia en el repo: `docs/disenos/<diseño>/v<N>-AAAA-MM-DD.html`
- Original: <enlace de claude.ai, si se dibujó ahí>
