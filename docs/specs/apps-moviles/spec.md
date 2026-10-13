# Spec: apps móviles de admin y store

> Estado: **análisis, sin implementar (2026-10-13)**. Pendiente de revisar a futuro.
> Repos involucrados: BackendNode, y repos nuevos para las apps (admin y store).

## Problema

Hoy la plataforma tiene dos clientes web (FrontendAdmin y FrontendStore). Se quiere evaluar agregar una app móvil de admin y otra de store, y saber qué le falta al backend para soportarlas.

## Diagnóstico: lo que ya sirve

- **Auth sin cookies.** El JWT de Supabase va en `Authorization: Bearer` ([auth.middleware.js](../../../middlewares/auth.middleware.js)). Supabase tiene SDK para Flutter, React Native y nativo.
- **CORS no aplica.** Una app nativa no envía `Origin`, así que la lista `CORS_ORIGIN` del admin no la bloquea ([server.js](../../../server.js)).
- **Admin.** El `tiendaId` llega explícito por body, params o query ([tienda-access.middleware.js](../../../middlewares/tienda-access.middleware.js)) y no depende del dominio. La app admin puede usar las mismas rutas `/api/v1/admin`.
- **Store.** Sin subdominio, `resolveTienda` cae a `?tienda=<slug>` o `tiendaId` ([resolve-tienda.middleware.js](../../../middlewares/resolve-tienda.middleware.js)). El rubro sale de la BD, así que la app no lo decide.
- **Pagos.** El backend solo recibe un `tokenId` de Culqi ([pasarela.store.routes.js](../../../modules/pagos/pasarela.store.routes.js)) y los webhooks van de servidor a servidor.
- **Contrato.** El formato de respuesta es estándar, la validación usa Zod y el OpenAPI está en `/api/v1/swagger.json`, lo que permite generar un cliente tipado.
- **Precedente.** La App Transmitir ya consume el backend con su propio token ([transmisiones.app.routes.js](../../../modules/transmisiones/transmisiones.app.routes.js)).

## Brechas

### B1. Notificaciones push (no existe nada)

No hay tabla de dispositivos ni servicio FCM, APNs o Expo, y todos los avisos salen por email. Para la app admin es la función de más valor ("nuevo pedido", "nueva reserva", "nuevo reclamo").

Haría falta:
- una tabla `dispositivos` con `usuarioId`, `tiendaId` opcional, `token`, `plataforma`, `app` (admin/store) y `ultimoUso`, más los campos de auditoría;
- endpoints para registrar y dar de baja un token (logout, token inválido devuelto por el proveedor);
- un servicio `push.service.js` detrás de una interfaz de proveedor, como `PaymentProvider` y `StreamingProvider`;
- enviar el push en los mismos puntos donde hoy se envía el email, con las preferencias por usuario y tienda.

### B2. Enlaces de los emails abren la web

Invitaciones, pedidos, reservas, libro de reclamaciones, acción de transmisión y onboarding arman sus URLs con `FRONTEND_URL` ([email.service.js](../../../services/email.service.js), [onboarding.service.js](../../../services/onboarding.service.js), [reservas.emails.js](../../../modules/reservas/reservas.emails.js), [libro.emails.js](../../../modules/libro-reclamaciones/libro.emails.js), [transmisiones.envivo.js](../../../modules/transmisiones/transmisiones.envivo.js)).

Haría falta:
- Universal Links (iOS) y App Links (Android): `apple-app-site-association` y `assetlinks.json` servidos desde el dominio web, manteniendo la web como respaldo si la app no está instalada;
- registrar el deep link de la app en las Redirect URLs de Supabase Auth, para el login con Google y la aceptación de invitaciones.

### B3. Versionado y compatibilidad

La web se despliega junto al backend, pero las apps instaladas no se actualizan solas. Un cambio que rompa `/api/v1` rompería las versiones viejas.

Haría falta:
- un endpoint público de configuración de app, con la versión mínima soportada y la recomendada por plataforma, para forzar o sugerir la actualización;
- una regla de compatibilidad en `/api/v1`: solo agregar campos, nunca quitarlos ni renombrarlos. Un cambio incompatible va a `/api/v2` o detrás de la versión de la app;
- opcional: un header `X-App-Version` / `X-App-Platform` para los logs y Sentry.

### B4. Rate limit por IP en redes móviles

Los operadores móviles hacen que muchos usuarios compartan una misma IP, así que podrían toparse con el límite sin abusar ([rate-limit.js](../../../kernel/http/rate-limit.js)). En las rutas con sesión conviene contar por `userId`; `crearLimitador` ya acepta `keyGenerator`. Se puede validar con el set de pruebas de carga.

### B5. La app store tiene que dibujar el Diseño

El layout por rubro (`layoutDeNegocio`, `LAYOUT_POR_NEGOCIO`, secciones y plantillas en `modules/diseno/`) hoy lo dibuja solo el FrontendStore. La app tiene que dibujar cada sección de cada rubro, o declarar cuáles soporta y saltar las demás. El backend ya entrega la estructura; el costo está en la app, y conviene un test de contrato que avise cuando una sección nueva no tenga equivalente en la app.

### B6. Pagos dentro de la app

Falta confirmar que el SDK móvil de Culqi, o Culqi Checkout en un WebView, entregue el mismo `tokenId` y los datos de `antifraud` que espera `crearCargoSchema`, y que el flujo 3DS funcione dentro de la app. Revisar también las políticas de Apple y Google: los bienes físicos y las reservas pueden usar una pasarela externa; el contenido digital (por ejemplo, transmisiones pagadas) podría exigir la compra dentro de la app.

### B7. Regla de "lógica por rubro" en más repos

`CLAUDE.md` dice "mismo nombre en los tres repos" para `negocio/<rubro>/`. Con apps serían cuatro o cinco: la regla y el test de contrato tienen que cubrirlas.

## Decisiones pendientes

1. **Modelo de la app store:**
   - **Una app con marca propia por tienda (white-label):** cada build fija su slug y el backend ya sirve. Implica publicar en las tiendas de apps por cliente.
   - **Una sola app tipo marketplace:** lista y busca tiendas. Necesita endpoints de descubrimiento y búsqueda entre tiendas, que hoy no existen y rompen el supuesto de "una tienda por request" del store.
2. **Roles de la app admin:** ¿todos, incluido `recepcionista` (una app de recepción para hotel), o solo algunos?
3. **Tecnología de las apps:** Flutter, React Native/Expo o nativo. Define si el push va por FCM directo o por Expo.
4. **Alcance de la primera versión de admin:** ¿todo el admin o un subconjunto móvil (pedidos, reservas, recepción, dashboard, notificaciones)?

## Orden sugerido (cuando se retome)

1. Resolver las decisiones pendientes.
2. B3 (versionado): primero, porque toda app publicada depende de él.
3. B1 (push) y B2 (deep links): son el valor principal de la app admin.
4. B4 (rate limit por usuario).
5. B5 y B6: solo si se hace la app store.
