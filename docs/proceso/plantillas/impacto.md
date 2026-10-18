# Impacto: <funcionalidad>

> Spec: [spec.md](spec.md) · Diseño: [diseno.md](diseno.md) · Estado: borrador

## Resumen en una frase
<Qué se construye y dónde, para alguien que no lee código.>

## Mapa de cambios
| Repo | Módulo / archivo | Tipo (nuevo / cambia / se borra) | Por qué |
|---|---|---|---|
| Backend | `modules/…` | | |
| Admin | `src/app/…` | | |
| Tienda | `src/app/…` | | |

## Contrato por rubro
- Capacidades nuevas o cambiadas (`contrato.js`, `perfil-negocio.ts`, `PiezasUi`, `LAYOUT_POR_NEGOCIO`…)
- Tests de contrato que cambian (`perfiles.spec.ts`, `uis.spec.ts`, tests de `negocio/`) y por qué es intencional
- Rubros afectados indirectamente (regresión posible)

## Patrones
Del [catálogo](../patrones.md). Uno por fila; si ninguno aplica, decirlo y por qué basta código directo.

| Patrón | Dónde se aplica | Por qué aplica (o por qué no hace falta) |
|---|---|---|

## Base de datos
- Tablas / columnas / índices / RLS
- SQL: `docs/sql/<archivo>.sql` (idempotente) + reversa
- Datos existentes: ¿qué pasa con las tiendas actuales?

## Configuración
| Llave | Repo / plataforma | Nueva / cambia / se quita | Valor de ejemplo / cómo generarla |
|---|---|---|---|
<Preferir parámetro de plataforma (`parametros.registro.js`) cuando el valor cambia sin deploy.>

## Alternativas consideradas
| Opción | A favor | En contra | Elegida |
|---|---|---|---|

## Riesgos
| Riesgo | Probabilidad | Mitigación |
|---|---|---|

## Orden de despliegue y reversa
<Normalmente backend → Admin → Tienda. Cómo se vuelve atrás.>
