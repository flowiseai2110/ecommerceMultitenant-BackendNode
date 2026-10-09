# Plan: comunicados de la tienda

> Implementa [spec.md](spec.md). Tareas y estado en [tasks.md](tasks.md).

## Datos

Una fila por tienda en `tienda_configuraciones` (`clave = "comunicados"`, `categoria = "comunicacion"`) con la lista completa en JsonB. Sin DDL y sin cron: el estado (`programado`, `activo`, `pausado`, `vencido`) se calcula al leer, en hora de Lima (UTC-5 fijo; Perú no tiene horario de verano). La categoría propia evita que `getDiseno` la levante.

## Backend (`modules/comunicados/`)

| Archivo | Qué hace |
|---|---|
| `comunicados.logic.js` | Reglas puras: `estadoDe`, `prepararLista` (ids, `inicio` por defecto, versión, auditoría, `emailEnvio` preservado, máximo 10 en curso, historial de 30), `listaAdmin`, `vigentesPublicos`, `isoLima`. |
| `comunicados.schema.js` | Zod del PUT (`linkSeguro` para el botón), del rango de fechas y del parámetro `:id`. |
| `comunicados.service.js` | `leerLista` / `guardarLista` (upsert por `uq_tienda_clave`), `getComunicadosAdmin`, `saveComunicados`, `getComunicadosPublicos`. |
| `comunicados.email.js` | Fase 2: `rangoLima`, `agruparPorEmail`, `comunicadoEmail` (HTML escapado), `contarDestinatarios`, `iniciarEnvio` (marca, responde y envía en segundo plano con pausa de 600 ms). |
| `comunicados.admin.routes.js` | `GET /` (viewer), `PUT /` (editor, invalida la caché pública), `GET /:id/destinatarios` y `POST /:id/enviar-email` (admin). Montado en `/admin/comunicados`; la tienda sale de `?tiendaId=` vía `requireTiendaAccess`, como `/admin/live`. |

Entrega pública: `modules/tenants/tiendas.store.routes.js` agrega `data[0].comunicados = getComunicadosPublicos(id)` en la búsqueda por slug, dentro de la misma caché de 60 s.

## Admin (`pages/comunicados/`)

- `comunicados.component.ts/html`: listado (en curso + historial plegable), selector de plantillas, formulario con validación local (corchetes, fechas, link) y errores del 400 ubicados por índice (`comunicados.N.campo`), panel de email de la fase 2 en la tarjeta.
- `comunicado-preview.component.ts`: maqueta móvil/desktop del modal o la barra. `NIVEL_UI` está duplicado a propósito en el storefront (`comunicado-ui.ts`).
- `comunicados.plantillas.ts`: 8 plantillas con `[corchetes]`, sugeridas según `tipoNegocio`.
- Servicio `comunicados.service.ts`, modelo `comunicado.model.ts`, ruta `/comunicados` con `unsavedChangesGuard` y entrada de menú junto a "Aviso de Live".

## Storefront

- `state/comunicados.state.ts`: vigentes (con vencimiento en el cliente cada minuto), memoria del cierre por `comunicado:tienda:id:version` en localStorage o sessionStorage con respaldo en memoria, y el diálogo abierto.
- `shared/components/comunicados/`: `comunicado-dialog` (modal automático con retraso de 1,5 s, listado "Avisos", foco atrapado, Esc, bloqueo de scroll, `alertdialog` si es urgente), `comunicado-barra` (bajo el header, en el flujo) y `comunicados-compra` (fijo en carrito, checkout y solicitud de reserva).
- `store-layout`: lee de la ruta `sinComunicadoModal`, `comunicadosCompra` y `esInicio` (en `store.routes.ts`). `store-header`: botón "Avisos (n)".
- Textos fijos en `textos.en.ts`; animación en `styles.css` solo con `prefers-reduced-motion: no-preference`.

## Despliegue

Orden: backend → admin → tienda. Un storefront viejo ignora `comunicados`; un backend viejo no lo manda y el storefront no muestra nada.
