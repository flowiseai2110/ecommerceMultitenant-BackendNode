# Plan técnico: efectos festivos y rediseño de Campañas

> Implementa [spec.md](spec.md). Tareas: [tasks.md](tasks.md).

## Flujo

```
Backend                          Admin                              Tienda
presets.js ──┐                   Campañas (cuándo + efecto)
calendario.js├─ resolver.js      Diseño (cómo se ve)                DisenoState
schema (Zod) ┘   disenoPublico   Editando: [Mi tienda|Navidad] ──►  iframe vista previa
                 └─ campana.efecto (ya resuelto) ─────────────────►  efecto festivo (canvas)
                                                                     1 vez por visita
```

Sin cambios de esquema de BD: todo sigue en `tienda_configuraciones` (claves `campanas` y `widgets`).

## Patrones

| # | Patrón | Dónde | Por qué |
|---|---|---|---|
| 1 | **Preset + personalización campo por campo** (ya existía) | `resolver.js#efectiva` | `efecto`, `efectoModo` y `saludo` usan `personalizacion ?? preset`, como el resto. Si mejoramos un preset, lo reciben las tiendas que no lo tocaron. Se descarta copiar el diseño por campaña (modelo Shopify/Tiendanube). |
| 2 | **Reglas de fecha como datos + funciones puras con reloj inyectado** (ya existía) | `calendario.js#ventanaEfecto` | El día clave del efecto es `diasEfecto` (desplazamientos desde la fecha clave). Testeable sin BD ni fake timers. |
| 3 | **Catálogo cerrado en un registro único** | `campanas/efectos.js` (`EFECTOS`) | Zod lo usa como enum; el admin lo recibe del calendario (`efectos`), sin copia. |
| 4 | **Resolver en el servidor y entregar solo lo necesario** (ya existía) | `resolverCampana` | `campana.efecto` llega solo si hoy cae en su ventana. La tienda no calcula fechas (R3.2). |
| 5 | **Modo de edición (State/Strategy)** | Admin `diseno/modo-edicion.ts` | Una tabla por modo dice si cada parte es `editable`, `heredada` u `oculta`. El template pregunta por la parte, nunca `modo === 'campana'`. Capacidades sobre identidad (CLAUDE.md). |
| 6 | **Adaptador a la vista previa** | Admin `campana-edicion.ts#campanaParaVista` | El borrador de la campaña se convierte en `diseno.campana` con la forma del backend; el iframe la dibuja con `desdeApi()`, el mismo código de producción. |
| 7 | **Memento** (ya existía: `Historial`) | Admin `diseno.component` | El snapshot suma `campanas`; Deshacer/Rehacer igual en los dos modos. |
| 8 | **Estado aparte del componente** | Admin `CampanaEdicion` (funciones puras) | `diseno.component.ts` ya tiene 640 líneas: la mezcla con el preset, "cambiado" y restablecer van a funciones puras testeables. |
| 9 | **Registro de efectos con carga diferida + Null Object** | Tienda `core/efectos/` | `Record<TipoEfecto, () => import(...)>`: si falta un tipo, no compila. Tipo desconocido o reduced motion → solo el saludo. |

**Antipatrones evitados:** copiar el diseño por campaña; `if (campana.id === 'navidad')`; `@if (modo === 'campana')` repartido; fechas en el navegador; listas copiadas a mano entre repos; un dibujo de campaña solo para la vista previa.

**No se aplica:** Builder/Abstract Factory (objetos JSON simples), bus de eventos (alcanzan las signals), tabla propia de campañas.

## Modelo (clave `campanas`, campos nuevos)

```jsonc
{
  "id": "…", "presetId": "navidad", "activa": true,
  // …campos de campanas-widgets…
  "efecto": null,        // TipoEfecto | null (null = el del preset; "ninguno" = sin efecto)
  "efectoModo": null,    // "clave" | "campana" | null (null = "clave")
  "saludo": null         // string ≤ 80 | null (null = el del preset; "" = sin saludo)
}
```

Preset: `efecto`, `diasEfecto` (`[-1, 0]` = día anterior y fecha clave) y `saludo`.

## Respuestas

```jsonc
// Storefront: diseno.campana
{ …, "efecto": { "tipo": "nieve", "saludo": "¡Feliz Navidad!" } | null }

// Admin: GET /campanas/calendario
{ "anio": 2026, "rubro": "…", "presets": [ … ], "efectos": ["nieve", …],
  "campanas": [ { …, "efecto": "nieve", "efectoModo": "clave",
                  "efectoInicio": "2026-12-24T00:00:00-05:00", "efectoFin": "2026-12-26T00:00:00-05:00" } ] }
```

## Storefront

- `core/efectos/efectos.ts`: `TipoEfecto`, registro con `import()` por efecto, `claveVisita()`.
- `core/efectos/motor.ts`: motor de partículas en canvas (un `requestAnimationFrame`, partículas acotadas por área, se detiene a los ~9 s).
- `shared/components/efecto-festivo`: canvas fijo `pointer-events: none` + saludo cerrable; se monta en `store-layout` y decide si mostrarse (rutas excluidas, una vez por visita, navegador).
- Vista previa: el borrador acepta `diseno.campana`; el mensaje `vp-efecto` reproduce el efecto sin la regla de "una vez por visita".

## Admin

- `models/campana.model.ts`: campos nuevos, `TipoEfecto`, `NOMBRE_EFECTO`.
- `pages/campanas`: calendario tipo Gantt + detalle (efecto, modo, anticipación, saludo; nombre y fechas en las propias). El editor de textos/colores/widgets pasa a Diseño.
- `pages/diseno`: selector "Editando", `modo-edicion.ts`, panel de campaña (`campana-panel.component.ts`, reutiliza `widgets-editor`), adornos de todo el año en Encabezado.
