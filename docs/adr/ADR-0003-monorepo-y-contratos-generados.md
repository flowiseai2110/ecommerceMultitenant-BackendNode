# ADR-0003: Un monorepo con contratos generados por el backend

- **Estado:** propuesta. Diego tomó la decisión de fondo el 2026-10-20; pasa a "aceptada" cuando apruebe el plan ([impacto](../specs/antipatrones/impacto.md)).
- **Fecha:** 2026-10-20
- **Decide:** Diego
- **Reemplaza:** la recomendación "dependencia por git" de la spec antipatrones (A8.5, preguntas abiertas)
- **Relacionadas:** [antipatrones A8](../specs/antipatrones/spec.md) · [tareas de la pieza 6](../specs/antipatrones/tasks.md)

## Contexto

- Tres repos (BackendNode, FrontendStore, FrontendAdmin) los trabaja una sola persona, y mucho código cambia junto. Hay unos 35 archivos con el mismo nombre en la Tienda y el Admin, ya distintos entre sí (`reserva.model.ts`: 1603 líneas distintas).
- Los tipos de la API se escriben a mano en cada front, y ya no coinciden con lo que manda el backend. Los `Decimal` llegan como texto y los modelos dicen `number` (hallazgo 2 del e2e de la pieza 4). La `Categoria` de la Tienda declara `fechaRegistro`, que su serializer no manda.
- El backend es JavaScript ESM y no puede tener TypeScript (`docs/ARQUITECTURA.md`, "Restricción dura").
- El backend es público en GitHub y la spec de antipatrones describe un hueco real (nota de seguridad del issue FrontendStore#1).

## Decisión

1. **Un monorepo** con npm workspaces, sin Nx: `apps/backend`, `apps/tienda`, `apps/admin`, `paquetes/contratos`, `paquetes/compartido`, y en la raíz `docs/` y `herramientas/`. Repo **privado**. Se conserva el historial de los tres (`git filter-repo --to-subdirectory-filter` + `merge --allow-unrelated-histories`), y los repos viejos se archivan.
2. **Lenguaje publicado:** cada serializer del backend declara su esquema Zod de salida (API `zod/v4`). `npm run contratos` lo pasa a JSON Schema (`z.toJSONSchema`) y de ahí a TypeScript (`json-schema-to-typescript`), en `paquetes/contratos/src/<audiencia>/`. Cada front usa solo los tipos de su audiencia.
3. **Núcleo compartido chico:** solo lo idéntico de verdad. Lo que varía entre apps se inyecta (Strategy por `InjectionToken`, design tokens, opción por `input()`). Se consume desde el código fuente, sin compilarlo aparte.
4. **Capa anticorrupción en cada front:** el DTO solo entra por data-access, que lo traduce al modelo de pantalla.
5. **Tipos de librería con reglas de dependencia** (feature, ui, data-access, util), vigiladas por `dependency-cruiser` con una línea base que solo baja.
6. Despliegues: los dos proyectos de Vercel y el servicio de Railway **se mantienen** (variables y dominios no cambian). Se reconectan al repo nuevo: en Vercel con Root Directory por app, y en Railway desde la raíz con comando de inicio y watch paths, porque Railway con Root Directory no ve el `package-lock.json` de la raíz.

## Consecuencias

- Un cambio de API y su efecto en los fronts van en el mismo commit, y si el front queda atrasado, no compila.
- Un cambio de contrato que quita o renombra un campo sigue necesitando dos despliegues (expandir y luego contraer), porque Railway y Vercel despliegan por separado.
- Un solo `package-lock.json`: las versiones de los tres se resuelven juntas. La migración tiene que comparar y fijar las dependencias directas que se muevan.
- Las rutas `../ecommerceMultitenant-…`, el plugin `ecommerce-proceso` (sus hooks reconocen los repos por nombre de carpeta), los `CLAUDE.md` y las memorias de Claude Code (guardadas por ruta) se actualizan en la migración.
- GitHub Actions en un repo privado tiene minutos limitados (hoy el backend es público y no los cuenta).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Paquete npm privado o dependencia por git con tags | Hay que publicar en cada cambio y el front queda atrasado igual. Es justo el problema que se quiere quitar |
| Nx (o Turborepo) | Con dos apps Angular y un backend, npm workspaces + `dependency-cruiser` alcanzan, sin otra herramienta, plugins ni caché que mantener. Se puede adoptar después sin mover carpetas |
| Inferir tipos con `z.infer` desde un paquete de esquemas | Los fronts tendrían que leer JS con `allowJs` o generar `.d.ts`, quedarían atados a la versión de Zod del backend y el backend dependería de un paquete en tiempo de ejecución |
| OpenAPI (`zod-to-openapi` + `openapi-typescript` / `ng-openapi-gen`) | Exige declarar cada ruta. `ng-openapi-gen` genera servicios que se saltan la capa anticorrupción. Queda abierto: el JSON Schema de hoy sirve para OpenAPI 3.1 |
| `zod-to-json-schema` | Sin mantenimiento desde noviembre de 2025 y archivado en junio de 2026. Zod 4 lo trae nativo |
| Librería Angular compilable (`ng generate library` + ng-packagr) | Pide compilarla antes de cada `serve` o `test` y un `--watch`. Solo vale si se publica |
| Contract testing (Pact) | Un solo equipo y un solo commit. El test de esquema por serializer y el `--check` cubren lo mismo |
| Convertir el repo FrontendStore en el monorepo (para no transferir las issues) | Se rompe la regla de dejar intactos los repos viejos, y la reversa de la Tienda deja de ser "volver a conectar el repo viejo" |
