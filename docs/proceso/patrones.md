# Catálogo de patrones del proyecto

> Los patrones que el código **ya usa**, dónde viven y cuándo aplican. El `arquitecto` elige de aquí en cada `impacto.md`
> (sección "Patrones") y dice por qué aplica o por qué no; Diego no tiene que pedirlos en el requerimiento.
> Un patrón que no está aquí solo entra con una decisión aprobada por Diego, y entonces se agrega a esta tabla.

## Regla general

- **Primero el patrón que ya existe**: extender el registro, la estrategia o la familia que ya hay, no inventar otra forma (spec `antipatrones`).
- **Un patrón se justifica por la variación real**, no por la posible: con una sola variante y sin otra a la vista, código directo.
  Dos rubros que difieren ya justifican la estrategia; un "por si acaso", no.
- **Textos y diferencias por rubro van al registro**, nunca en ramas de la plantilla (`@if`, ternarios por rubro).

## Patrones en uso

| Patrón | Para qué | Dónde vive | Aplica cuando | No aplica cuando |
|---|---|---|---|---|
| **Strategy por rubro** | Reglas que cambian por rubro sin `if (rubro === …)` | Backend `modules/negocio/registro.js` (`estrategiaDe`), `negocio/<rubro>/estrategia.js`, `modules/reservas/<rubro>/` | Una regla de negocio difiere entre rubros | La regla es igual para todos los rubros |
| **Registry + contrato** | Una sola lista de lo que existe, que no compila o no pasa el test si falta algo | `perfiles.ts` / `uis.ts` (`perfilDe`, `uiDe`) en los fronts; `parametros.registro.js`; `LAYOUT_POR_NEGOCIO`; `TIPOS_WIDGET` y `COMPONENTES_WIDGET`; `contrato.js` | Algo nuevo que debe existir para todos los rubros o tipos | Una lista privada de un solo módulo |
| **Abstract Factory de UI (familias + slot)** | Que el header, la home o la cuenta dibujen piezas distintas por rubro sin ramas | Tienda `negocio/ui-negocio.ts` (`PiezasUi`), `negocio/familias/{comercio,reserva}/ui.ts`, `<app-slot-rubro>` | La **estructura** de una pantalla compartida cambia por rubro | Solo cambia un texto o una capacidad (eso va al perfil) |
| **Herencia por familia, reemplazo puntual** | Un rubro hereda de su familia y reemplaza solo lo distinto; una tienda hereda de su rubro (`EXCEPCIONES`) | `negocio/<rubro>/ui.ts`, `EXCEPCIONES` en el registro del backend | Un rubro o un cliente difiere en pocas cosas | Difiere en casi todo (otra familia) |
| **Capacidades, no identidad** | El código compartido pregunta "¿tiene carrito?", no "¿es hotel?" | Perfiles de los fronts, `datos.js` del backend | Siempre en código compartido | Código que ya es de un solo rubro |
| **Función pura + cargador** (núcleo funcional) | Que una regla de cálculo se pruebe sin BD y viva en un solo lugar | Regla en `<x>.js` sin Prisma; lectura en `<x>.service.js` (recibe `tx`): `envios/cotizacion.js` + `cotizacion.service.js`, `ordenes/rastreo.js`, `campanas/resolver.js`, `precios/precio-vigente.js` + `cotizacion-compra.js` + `cotizacion-compra.service.js`, `cupones/regla-cupon.js` | Un cálculo de dinero, fechas o reglas que se usa en más de un camino (mostrar y cobrar) | CRUD sin regla propia |
| **Repository → Service → Controller** | Separar acceso a datos, reglas y HTTP | Cada módulo del backend | Todo endpoint nuevo | — |
| **Adapter / driver** | Cambiar de proveedor sin tocar el negocio | `services/storage.service.js` (`STORAGE_DRIVER`), `services/streaming/` (`STREAMING_DRIVER`), `modules/pagos/` (`PAGOS_PROVEEDOR`, simulador) | Un servicio externo que podría cambiar o tener simulador | Una librería interna sin alternativa |
| **Contexto ambiental + interceptor** | El tenant (y la sede) se aplican solos a cada consulta | `kernel/tenant/` (ALS, `alcance.js`), extensión de Prisma en `config/prisma.js` | Todo modelo con datos de una tienda | Tablas de referencia globales (`ALCANCE` las marca) |
| **Seguro por defecto** | Lo nuevo nace protegido (auto-scope, RLS) | `ALCANCE`, SQL con RLS | Toda tabla o modelo nuevo | — |
| **Fitness function (test de regla)** | Un test que vigila una regla de arquitectura | `perfiles.spec.ts`, `uis.spec.ts`, `modules/negocio/__tests__/`, `errores-async.test.js`, test de `parametros` | Una regla que se rompería en silencio | Comportamiento ya cubierto por un test normal |
| **Idempotencia** | Un reintento no duplica pedidos, reservas ni cobros | `idempotencyKey` en pedidos y reservas; eventos de pago únicos | Crear pedidos/reservas, webhooks, cobros | Lecturas |
| **Serializer** | Lo que sale de la API no expone campos internos | Convención en `docs/ARQUITECTURA.md` ("Serializers"), `*.serializer.js` | Toda respuesta nueva con datos de la BD | — |
| **Parámetro de plataforma** | Valores que cambian sin deploy | `modules/parametros/` | El dueño de la plataforma lo ajusta | Secretos o valores por entorno (eso es una llave) |

## Antipatrones conocidos

Los siete del barrido del 2026-10-17 y su patrón de reemplazo están en la spec `docs/specs/antipatrones/`.
