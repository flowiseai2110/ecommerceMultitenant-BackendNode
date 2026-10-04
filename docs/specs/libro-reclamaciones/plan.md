# Plan técnico: Libro de Reclamaciones virtual

> Implementa [spec.md](spec.md). Tareas y estado: [tasks.md](tasks.md).

## Flujo

```
FrontendStore · /:slug/libro-reclamaciones            (footer → ícono libro abierto, siempre visible)
  GET /store/libro-reclamaciones/proveedor?tiendaId   → cabecera (razón social, RUC, dirección)
  [con sesión] GET /store/cuenta/pedidos               → selector de pedido + precarga de datos
  Formulario (3 bloques) → POST /store/libro-reclamaciones
          │
BackendNode · modules/libro-reclamaciones
  libroLimiter (5 / ventana / IP) → honeypot → Zod
  libro.service.registrarHoja()
    $transaction
      pg_advisory_xact_lock(hashtext('libro_<tiendaId>_<anio>'))
      correlativo = MAX(correlativo)+1 (tienda, anio)          → numero "00001-2026"
      snapshot proveedor ← tiendas (ruc, razonSocial, direccionFiscal|direccion, nombre)
      fechaLimite ← plazos.sumarDiasHabiles(hoyLima, 15)
      INSERT libro_reclamaciones + evento "registrada"
    token ← libro.token.firmar({ hojaId, tiendaId })
    (sin await bloqueante) correo constancia → consumidor · correo aviso → tienda
      → evento "constancia_enviada" | "constancia_fallo"
  ← 201 { numero, fechaRegistro, fechaLimite, token, hoja }
          │
FrontendStore · /:slug/libro-reclamaciones/hoja/:token   (constancia imprimible)
  GET /store/libro-reclamaciones/hoja/:token → hoja + respuesta (si existe)

FrontendAdmin · /libro-reclamaciones
  GET /admin/libro-reclamaciones/resumen  → badge del menú (porVencer + vencidas)
  GET /admin/libro-reclamaciones          → bandeja (orden: fechaLimite ASC)
  GET /admin/libro-reclamaciones/:id      → detalle + eventos
  POST /admin/libro-reclamaciones/:id/respuesta
    $transaction
      UPDATE ... SET estado='respondida' WHERE id AND estado<>'respondida'   (bloquea la fila)
        0 filas → 409 YA_RESPONDIDA
      medio=email → Resend (respuesta al consumidor)    ✗ → throw → ROLLBACK → 502
      evento "respondida" { messageId }
  GET /admin/libro-reclamaciones/exportar.csv
```

## Modelo de datos

Dos tablas nuevas. Nombres y auditoría con las convenciones del `schema.prisma`. El DDL va en `docs/sql/libro_reclamaciones_setup.sql`, generado con `prisma migrate diff` (igual que `resenas_setup.sql`).

```prisma
// ============================================
// MÓDULO: LIBRO DE RECLAMACIONES (Ley 29571, DS 011-2011-PCM, DS 101-2022-PCM)
// ============================================
// Una fila = una Hoja de Reclamación (Anexo I). Los datos que registró el
// consumidor y el snapshot del proveedor NO se modifican ni se borran: lo
// impone un trigger SQL (docs/sql/libro_reclamaciones_setup.sql). Solo cambian
// estado y respuesta. Conservación mínima: 2 años.

model libro_reclamaciones {
  id                     String    @id @default(uuid()) @db.Uuid
  tiendaId               String    @map("tienda_id") @db.Uuid
  anio                   Int       @db.SmallInt
  correlativo            Int
  numero                 String    @db.VarChar(15)          // "00001-2026"
  tipo                   String    @db.VarChar(10)          // reclamo | queja
  // pendiente | en_atencion | respondida
  estado                 String    @default("pendiente") @db.VarChar(20)
  fechaLimite            DateTime  @map("fecha_limite") @db.Date

  // Snapshot del proveedor al registrarse
  proveedorNombre        String    @map("proveedor_nombre") @db.VarChar(100)
  proveedorRazonSocial   String?   @map("proveedor_razon_social") @db.VarChar(200)
  proveedorRuc           String?   @map("proveedor_ruc") @db.VarChar(20)
  proveedorDireccion     String?   @map("proveedor_direccion") @db.Text

  // Consumidor
  consumidorNombres      String    @map("consumidor_nombres") @db.VarChar(100)
  consumidorApellidos    String    @map("consumidor_apellidos") @db.VarChar(100)
  consumidorDocTipo      String    @map("consumidor_doc_tipo") @db.VarChar(10)   // DNI | CE | PASAPORTE
  consumidorDocNumero    String    @map("consumidor_doc_numero") @db.VarChar(20)
  consumidorDomicilio    String    @map("consumidor_domicilio") @db.Text
  consumidorTelefono     String?   @map("consumidor_telefono") @db.VarChar(20)
  consumidorEmail        String    @map("consumidor_email") @db.VarChar(100)
  esMenor                Boolean   @default(false) @map("es_menor")
  apoderadoNombre        String?   @map("apoderado_nombre") @db.VarChar(200)
  apoderadoDocTipo       String?   @map("apoderado_doc_tipo") @db.VarChar(10)
  apoderadoDocNumero     String?   @map("apoderado_doc_numero") @db.VarChar(20)

  // Bien contratado
  bienTipo               String    @map("bien_tipo") @db.VarChar(10)              // producto | servicio
  bienDescripcion        String    @map("bien_descripcion") @db.Text
  montoReclamado         Decimal?  @map("monto_reclamado") @db.Decimal(10, 2)
  moneda                 String    @default("PEN") @db.VarChar(3)
  pedidoId               String?   @map("pedido_id") @db.Uuid   // solo si coincide con un pedido real de la tienda
  numeroPedidoTexto      String?   @map("numero_pedido_texto") @db.VarChar(30)  // lo que escribió el consumidor

  // Detalle
  detalle                String    @db.Text
  pedidoConsumidor       String    @map("pedido_consumidor") @db.Text
  medioRespuesta         String    @default("email") @map("medio_respuesta") @db.VarChar(10) // email | domicilio
  aceptaDeclaracion      Boolean   @map("acepta_declaracion")
  authUserId             String?   @map("auth_user_id") @db.Uuid
  ipHash                 String?   @map("ip_hash") @db.VarChar(64)   // sha256(ip + sal): auditoría de abuso, sin guardar la IP

  // Respuesta del proveedor
  respuesta              String?   @db.Text
  accionAdoptada         String?   @map("accion_adoptada") @db.Text
  fechaRespuesta         DateTime? @map("fecha_respuesta") @db.Timestamptz   // envío del correo o entrega de la carta
  respondidoPor          String?   @map("respondido_por") @db.VarChar(100)

  // Auditoría
  fechaRegistro          DateTime  @default(now()) @map("fecha_registro") @db.Timestamptz
  usuarioRegistro        String?   @map("usuario_registro") @db.VarChar(100)
  fechaActualizacion     DateTime? @map("fecha_actualizacion") @db.Timestamptz
  usuarioActualizacion   String?   @map("usuario_actualizacion") @db.VarChar(100)

  tienda                 tiendas   @relation(fields: [tiendaId], references: [id], onDelete: Restrict)
  pedido                 pedidos?  @relation(fields: [pedidoId], references: [id], onDelete: SetNull)
  eventos                libro_reclamaciones_eventos[]

  @@unique([tiendaId, anio, correlativo], name: "uq_libro_correlativo")
  @@index([tiendaId, estado, fechaLimite], name: "idx_libro_tienda_estado_limite")
  @@index([tiendaId, fechaRegistro(sort: Desc)], name: "idx_libro_tienda_fecha")
}

// Historial de la hoja: registro, envíos de correo (ok/fallo), cambios de estado
// y respuesta. Es la prueba de que se entregó la constancia y se respondió a tiempo.
model libro_reclamaciones_eventos {
  id            String    @id @default(uuid()) @db.Uuid
  hojaId        String    @map("hoja_id") @db.Uuid
  // registrada | constancia_enviada | constancia_fallo | aviso_tienda_enviado
  // | en_atencion | respondida | respuesta_fallo
  tipo          String    @db.VarChar(30)
  detalle       Json?     @db.JsonB          // { messageId } · { error } · { medio }
  usuario       String?   @db.VarChar(100)
  fechaRegistro DateTime  @default(now()) @map("fecha_registro") @db.Timestamptz

  hoja          libro_reclamaciones @relation(fields: [hojaId], references: [id], onDelete: Restrict)

  @@index([hojaId, fechaRegistro], name: "idx_libro_eventos_hoja")
}
```

Reglas que Prisma no expresa (en el `.sql`):

```sql
ALTER TABLE libro_reclamaciones
  ADD CONSTRAINT libro_tipo_valido   CHECK (tipo IN ('reclamo','queja')),
  ADD CONSTRAINT libro_estado_valido CHECK (estado IN ('pendiente','en_atencion','respondida')),
  ADD CONSTRAINT libro_bien_valido   CHECK (bien_tipo IN ('producto','servicio')),
  ADD CONSTRAINT libro_medio_valido  CHECK (medio_respuesta IN ('email','domicilio')),
  ADD CONSTRAINT libro_menor_apoderado CHECK (NOT es_menor OR (apoderado_nombre IS NOT NULL AND apoderado_doc_numero IS NOT NULL)),
  ADD CONSTRAINT libro_monto_positivo CHECK (monto_reclamado IS NULL OR monto_reclamado >= 0);

-- Inmutabilidad (R3.4): solo pueden cambiar estado, respuesta y auditoría.
CREATE OR REPLACE FUNCTION libro_reclamaciones_inmutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las hojas del Libro de Reclamaciones no se pueden borrar';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['estado','respuesta','accion_adoptada','fecha_respuesta','respondido_por',
                            'fecha_actualizacion','usuario_actualizacion','pedido_id'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['estado','respuesta','accion_adoptada','fecha_respuesta','respondido_por',
                            'fecha_actualizacion','usuario_actualizacion','pedido_id']) THEN
    RAISE EXCEPTION 'Los datos de la hoja % no se pueden modificar', OLD.numero;
  END IF;
  IF OLD.estado = 'respondida' AND NEW.respuesta IS DISTINCT FROM OLD.respuesta THEN
    RAISE EXCEPTION 'La respuesta de la hoja % ya fue enviada', OLD.numero;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_libro_inmutable BEFORE UPDATE OR DELETE ON libro_reclamaciones
  FOR EACH ROW EXECUTE FUNCTION libro_reclamaciones_inmutable();
-- Mismo trigger (solo DELETE/UPDATE → excepción) para libro_reclamaciones_eventos: es append-only.

ALTER TABLE public.libro_reclamaciones         ENABLE ROW LEVEL SECURITY;   -- sin políticas (R8.1)
ALTER TABLE public.libro_reclamaciones_eventos ENABLE ROW LEVEL SECURITY;
```

`pedido_id` queda fuera del trigger porque `ON DELETE SET NULL` lo cambia si se borra el pedido. `numero_pedido_texto` conserva lo que escribió el consumidor.

## Plazo de 15 días hábiles

`modules/libro-reclamaciones/plazos.js`, funciones puras y testeables:

```js
// Feriados nacionales. VERIFICAR la lista antes de implementar (07-23 y 08-06
// son recientes) y revisarla cada diciembre contra gob.pe
// y El Peruano: el Congreso agrega feriados. Formato YYYY-MM-DD.
export const FERIADOS = {
  2026: ["2026-01-01","2026-04-02","2026-04-03","2026-05-01","2026-06-07","2026-06-29",
         "2026-07-23","2026-07-28","2026-07-29","2026-08-06","2026-08-30","2026-10-08",
         "2026-11-01","2026-12-08","2026-12-09","2026-12-25"],
  2027: [/* Jueves/Viernes Santo 2027: 03-25 y 03-26 */ ...]
};

export function hoyLima(now = new Date()) { /* Intl → "YYYY-MM-DD" en America/Lima */ }
export function esDiaHabil(fechaISO, feriados = FERIADOS) { /* lun–vie y no feriado */ }
export function sumarDiasHabiles(fechaISO, n, feriados = FERIADOS) { /* empieza el día siguiente */ }
export function diasHabilesRestantes(fechaLimiteISO, hoyISO, feriados = FERIADOS) { /* ≤0 = vence hoy o vencida */ }
export function semaforo(hoja, hoyISO) { /* verde | ambar | rojo | null si respondida */ }
```

- El día se calcula en `America/Lima`, no en UTC: una hoja registrada a las 21:00 en Lima (02:00 UTC del día siguiente) cuenta desde el día siguiente **de Lima**.
- `fechaLimite` se **guarda** al registrar. Si después se agrega un feriado a la lista, las hojas viejas no cambian su plazo: es el que se le comunicó al consumidor en su constancia.
- Si `FERIADOS[anio]` no existe, `logger.warn` y se cuentan solo los fines de semana (R5.3). Un test falla en diciembre si falta el año siguiente, como recordatorio.

## Correlativo

El mismo patrón que `#generarNumeroPedido` (advisory lock por tienda dentro de la transacción), pero sobre una columna entera en vez de parsear un string:

```js
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`libro_${tiendaId}_${anio}`}))`;
const [{ max }] = await tx.$queryRaw`
  SELECT COALESCE(MAX(correlativo), 0) AS max FROM libro_reclamaciones
  WHERE tienda_id = ${tiendaId}::uuid AND anio = ${anio}`;
const correlativo = Number(max) + 1;
const numero = `${String(correlativo).padStart(5, "0")}-${anio}`;
```

El índice único `(tienda_id, anio, correlativo)` es la red de seguridad si algún día se escribe sin el lock.

## Endpoints

### Store (`routes/store/index.js` → `router.use("/libro-reclamaciones", libroRoutes)`, sin caché global)

| Método y ruta | Auth | Respuesta |
|---|---|---|
| `GET /proveedor?tiendaId=` | pública | `{ nombre, razonSocial, ruc, direccion, email, moneda }` · `Cache-Control: public, max-age=300` |
| `POST /` | `optionalAuth` + `libroLimiter` | 201 `LIBRO_HOJA_REGISTRADA` `{ numero, fechaRegistro, fechaLimite, token, hoja }` |
| `GET /hoja/:token` | token firmado | 200 `LIBRO_HOJA` `{ hoja, respuesta? }` · `Cache-Control: private, no-store` |

`POST /`:
- `scopeBodyToTienda` + `validate({ body: crearHojaSchema })`.
- Honeypot `sitioWeb`: si viene con texto, responde **201 falso** (sin guardar) para que el bot no aprenda.
- `pedidoId` solo se acepta con sesión y si el pedido es de la tienda y de `req.user.id`. Si no, se ignora y se guarda solo `numeroPedidoTexto`. Sin sesión se intenta enlazar `numeroPedidoTexto` a un pedido de la tienda **en silencio**, solo para el admin (R2.4).
- Los correos se mandan **después del commit**, sin bloquear la respuesta HTTP más de lo necesario (`Promise.allSettled` con timeout corto). El resultado queda como evento.

### Admin (`routes/admin/index.js` → `/libro-reclamaciones`)

| Método y ruta | Rol mínimo | Uso |
|---|---|---|
| `GET /resumen?tiendaId=` | viewer | `{ pendientes, porVencer, vencidas }` para el badge |
| `GET /?tiendaId&estado&tipo&semaforo&desde&hasta&q&page&limit` | viewer | Bandeja paginada |
| `GET /:id?tiendaId=` | viewer | Detalle + eventos + pedido enlazado |
| `PATCH /:id/estado` `{ estado: "en_atencion" }` | admin | Marca interna |
| `POST /:id/respuesta/vista-previa` | admin | HTML del correo que recibirá el consumidor |
| `POST /:id/respuesta` `{ respuesta, accionAdoptada?, fechaEntregaCarta? }` | admin | Responde (R6.5 / R6.6) |
| `GET /exportar.csv?tiendaId&desde&hasta` | admin | CSV UTF-8 con BOM (Excel en español) |

El semáforo no se guarda: se calcula al serializar con `plazos.semaforo()`. Para filtrar por semáforo y para el resumen, el servicio traduce a rangos de `fecha_limite`: `porVencer` = `estado <> 'respondida' AND fecha_limite BETWEEN hoy AND sumarDiasHabiles(hoy, 5)`, `vencidas` = `fecha_limite < hoy`. Así usa el índice `idx_libro_tienda_estado_limite`.

Respuesta por correo: el `UPDATE ... WHERE estado <> 'respondida'` va **dentro** de la transacción y **antes** del envío. Bloquea la fila, así que dos admins que responden a la vez no mandan dos correos (el segundo recibe 409). Si Resend falla, `throw` → rollback → la hoja sigue pendiente (R6.5). La transacción queda abierta ~1 s durante el envío; con este volumen es aceptable.

## Token de la constancia

`modules/libro-reclamaciones/libro.token.js`, copia del patrón de `resenas.token.js`:
- HS256 con `LIBRO_LINK_SECRET`, `aud: "libro-hoja"`, `sub: hojaId`, claim `tid: tiendaId`.
- TTL `LIBRO_LINK_TTL_DIAS` (por defecto 1095 = 3 años, por encima de los 2 de conservación).
- En la ruta se compara `tid` con `req.tiendaId` (R8.3).

## Correos (`modules/libro-reclamaciones/libro.emails.js`)

> Implementación: las plantillas viven en el módulo y se envían con `sendTransactionalEmail` (nuevo en `services/email.service.js`, que también exporta `escapeHtml` y acepta `replyTo`). A diferencia de los `send*` existentes, lanza si falta la API key: quien llama decide si el fallo bloquea (respuesta) o solo se registra (constancia).

| Función | Para | Contenido |
|---|---|---|
| `sendHojaReclamacionConsumidorEmail(hoja, tienda, url)` | consumidor | Copia completa de la hoja (Anexo I), número, fecha, plazo, link a la constancia, textos legales |
| `sendHojaReclamacionTiendaEmail(hoja, tienda, urlAdmin)` | `tiendas.email` | Número, tipo, consumidor, fecha límite, botón "Responder" |
| `sendRespuestaHojaEmail(hoja, tienda)` | consumidor | Respuesta y acción adoptada, con la hoja original citada |

- `deliverEmail` necesita un parámetro `replyTo` nuevo (el correo de la tienda), para que el consumidor que responde al correo le escriba a la tienda y no al remitente de la plataforma.
- En desarrollo `RESEND_DEV_TO_EMAIL` redirige todo, como hoy.
- Las tres plantillas comparten un bloque `renderHojaHTML(hoja)` con tablas inline (sin CSS externo), que también sirve para la vista previa.

## FrontendStore

```
src/app/features/claims-book/
  claims-book-page/        /:slug/libro-reclamaciones        (formulario de 3 bloques)
  claim-receipt-page/      /:slug/libro-reclamaciones/hoja/:token   (constancia + respuesta)
  services/claims-book.service.ts
src/app/models/libro-reclamaciones.model.ts      (tipos + validadores de documento)
src/app/shared/components/claims-book-link/      (ícono libro abierto + texto, variantes footer | inline)
```

- **Footer (R1.1):** `claims-book-link` va en la barra inferior del `store-footer` (junto al copyright) **y** en la columna "Ayuda". No lee ninguna opción del diseño, así ninguna plantilla ni tema puede ocultarlo. El SVG del libro abierto es inline (sin request extra).
- **Formulario:** mismo enfoque que el checkout (signals + `ngModel`), validación en vivo y en el envío. Tres bloques con encabezado numerado: *1. Tus datos* · *2. Qué contrataste* · *3. Tu reclamo o queja*. Tarjetas de selección para Reclamo/Queja con su definición. Botón fijo abajo en el móvil.
- **Precarga (R2.9):** si `AuthState` tiene sesión, se piden los datos de la cuenta y sus pedidos de esta tienda (endpoints de `cuenta.store.routes.js` que ya existen).
- **Envío:** botón deshabilitado + "Registrando…". Con Railway frío (cold start del free tier) puede tardar varios segundos; el texto lo explica después de 4 s.
- **Constancia:** la página agrega `modo-constancia` a `<body>` y un bloque `@media print` en `styles.css` oculta header, footer, chat, bottom-nav, live banner y widgets (sin tocar `store-layout`). `meta robots noindex`. Tras el registro se navega a `hoja/:token` con `replaceUrl`, así recargar la página no reenvía el formulario.
- **SSR:** la página del formulario se renderiza en el servidor (cabecera del proveedor incluida). La constancia **no**: igual que `/resenar/:token`, el token no viaja al render del servidor; se carga en el navegador y lleva `robots: noindex`.
- Enlace también en `account-page` y `order-tracking-page` (R1.2).

## FrontendAdmin

```
src/app/pages/libro-reclamaciones/
  libro-list/      bandeja: filtros, chips de semáforo, búsqueda, paginación, botón Exportar CSV
  libro-detail/    hoja completa (layout Anexo I) + timeline de eventos + panel "Responder"
src/app/services/libro-reclamaciones.service.ts
src/app/services/libro-alertas.service.ts      (como resenas-alertas: badge del menú)
src/app/models/libro-reclamacion.model.ts
```

- Menú lateral: "Libro de Reclamaciones" con un badge rojo si hay vencidas o uno ámbar si hay hojas por vencer.
- Panel "Responder": textarea + acción adoptada → "Vista previa" (HTML del backend en un iframe `srcdoc`) → `confirm-dialog` ("Esta respuesta se enviará a ana@mail.com y no se podrá editar") → enviar.
- Si `medioRespuesta = domicilio`: el panel cambia a "Registrar carta entregada" con una fecha (no se envía correo).
- Botones de responder y exportar ocultos para editor/viewer (el backend igual lo valida).
- Dashboard: tarjeta de aviso si faltan RUC, razón social o dirección (R7.1), con link a `tiendas/edit/:id`.

## Asistencia con IA (R9, fase 2)

> Diseño sin implementar. No cambia la base de datos: usa las funciones existentes de `libro.service.js` y la tabla de eventos.

### Flujo

```
FrontendAdmin · Guía (chat)
  "ayúdame a responder la 00012-2026, le vamos a cambiar el producto"
  POST /admin/asistente  → asistente.service.responderTurno({ tiendaId, rol, ... })
    tool consultar_reclamaciones      → libro.service.resumenHojas + listarHojasAdmin   (R9.1)
    tool ver_reclamacion              → libro.service.detalleHoja → libro.ia.paraModelo() (R9.2, R9.11)
    tool redactar_respuesta_reclamo   → solo owner/admin (R9.6)
        libro.ia.redactarBorrador(hoja, { solucion, notas })
          llamada aparte a Messages API: prompt fijo de redacción (R9.5), max_tokens ~1500
          valida 20–5 000 caracteres · registra evento "borrador_ia" · suma consumo IA
        ← acción { tipo:"borrador_reclamo", hojaId, numero, respuesta, accionAdoptada }
  ← { mensaje, acciones: [botón "Usar este borrador en la hoja 00012-2026"] }

FrontendAdmin · botón → /libro-reclamaciones/:id con el borrador en el state del router
  panel Responder precargado (editable) → Vista previa → confirmar
  POST /admin/libro-reclamaciones/:id/respuesta { respuesta, accionAdoptada, asistidaPorIa: true }
    responderHoja (sin cambios de flujo) → evento "respondida" { ..., asistidaPorIa }   (R9.7)

FrontendStore · asesor de ventas
  "el polo llegó roto, quiero reclamar"
    system prompt: reglas R9.8 / R9.9 + enlace /:slug/libro-reclamaciones
    tool mis_reclamaciones (solo con sesión) → hojas WHERE tiendaId AND authUserId   (R9.10)
```

### Guía del admin: herramientas

| Tool | Entrada | Devuelve al modelo | Rol |
|---|---|---|---|
| `consultar_reclamaciones` | `estado?`, `semaforo?` (enums) | conteos de `resumenHojas` + hasta 5 hojas: `{ id, numero, tipo, estado, diasHabilesRestantes, semaforo }` | viewer+ |
| `ver_reclamacion` | `numero` o `numeroPedido` | `paraModelo(hoja)` (ver minimización) | viewer+ |
| `redactar_respuesta_reclamo` | `hojaId`, `solucion` (texto corto que decidió el usuario), `notas?` | `{ ok, numero, extracto }` + **acción** de UI | owner/admin |

- **El rol llega al servicio.** `asistente.admin.routes.js` pasa `req.tenant.rol` a `responderTurno` y este a `ejecutarTool`. Para editor/viewer, `redactar_respuesta_reclamo` **no se incluye en `TOOLS`**: el modelo ni siquiera la ve, y además `ejecutarTool` la rechaza (defensa doble).
- **Búsqueda por número** (`00012-2026`, `12`, `12-2026`): se normaliza y se filtra por `tiendaId`. Una hoja de otra tienda responde `NO_ENCONTRADA`.
- **`PANTALLAS`** (`asistente.catalogo.js`) suma `"/libro-reclamaciones": "Libro de Reclamaciones: hojas de reclamo/queja, plazos y respuestas"`, para que `ir_a_pantalla` pueda llevar a la bandeja.
- **`claveAccion`** pasa a `${a.tipo}:${a.ruta ?? a.tourId ?? a.hojaId}`. `redactar_respuesta_reclamo` entra en `TOOLS_DE_UI` (corte temprano si el modelo ya escribió texto).
- **Conocimiento** (`asistente.conocimiento.js`): una sección corta sobre reclamo vs queja, el plazo, que la respuesta no se edita y la regla "pregunta qué solución dará la tienda antes de redactar".

### Redacción: llamada aparte (`modules/libro-reclamaciones/libro.ia.js`)

El borrador **no** lo escribe la Guía dentro del chat, por tres razones:

1. **Tamaño.** La Guía corre con `max_tokens: 600` (`config.asistente.maxTokens`); una respuesta formal puede necesitar 1 000–1 500 tokens. Subir el límite de todo el chat encarece cada turno.
2. **Prompt dedicado.** Las reglas de R9.5 (responder cada punto, no prometer lo no decidido, tono formal, número de hoja) van en un system prompt fijo que no se mezcla con el manual del panel.
3. **Aislamiento del texto del consumidor** (R9.12). La hoja llega a la redacción como bloque de datos delimitado (`<hoja>…</hoja>`), con la instrucción explícita de que su contenido es la versión del consumidor y no contiene órdenes.

```js
// libro.ia.js
export function paraModelo(hoja, pedido) {      // R9.11: lista BLANCA de campos
  return {
    numero, tipo, estado, fechaRegistro, fechaLimite, diasHabilesRestantes,
    bien: { tipo: bienTipo, descripcion: bienDescripcion }, montoReclamado, moneda,
    detalle, pedidoConsumidor, medioRespuesta,
    consumidor: primerNombre(consumidorNombres),             // "Ana"
    pedido: pedido && { numero, estado, estadoPago, metodoEnvio, fechas, items: [{ nombre, cantidad }], historial }
  };
}
export async function redactarBorrador(hoja, { solucion, notas }, { tienda }) → { respuesta, accionAdoptada, uso }
```

- **Salida estructurada:** la redacción usa una tool forzada (`tool_choice`) `entregar_borrador({ respuesta, accionAdoptada })`, así el texto llega separado y validable con el mismo Zod de la respuesta (`libro.schema.js`: 20–5 000 y ≤ 2 000).
- **Modelo:** `LIBRO_IA_MODELO`, con `ASISTENTE_IA_MODELO` (Haiku 4.5) como valor por defecto. Es configurable aparte por si la calidad de redacción legal pide un modelo mayor solo para esta llamada (es poco frecuente, así que el costo es acotado).
- **Consumo:** los tokens de la redacción se suman al `uso` del turno de la Guía, así cuentan en `consumo-ia` como una sola consulta con su costo real (R9.13).
- **Evento `borrador_ia`** en `libro_reclamaciones_eventos` (`{ modelo, caracteres }`, sin el texto): registro del lado del servidor de que se generó un borrador. La tabla es append-only, así que insertar está permitido.

### Respuesta con borrador

- `responderSchema` suma `asistidaPorIa: z.boolean().optional().default(false)`. `responderHoja` lo agrega al `detalle` del evento `respondida`. No cambia nada más del flujo (vista previa, confirmación, transacción con el correo).
- El flag lo declara el frontend: es `true` si el panel se llenó desde un borrador, aunque luego se edite. Junto con el evento `borrador_ia` del servidor alcanza para medir el uso; no es una prueba forense ni pretende serlo.
- **FrontendAdmin:** el chat de la Guía renderiza la acción `borrador_reclamo` como botón. El botón navega con `router.navigate([...], { state: { borrador } })` y el detalle precarga el panel con la etiqueta "Borrador sugerido por la IA — revísalo antes de enviar". El borrador **no** se guarda en el servidor: si se recarga la página, se pierde y se pide otro.

### Asesor de ventas: derivar y consultar

- **System prompt** (`modules/agente`): reglas R9.8 y R9.9 en tono de instrucción, más la ruta del libro de la tienda. El enlace lo arma el frontend con el slug, como los demás links del chat.
- **Tool `mis_reclamaciones`** (`modules/agente/tools/mis-reclamaciones.js`), copia del patrón de `estado-pedido.js`:
  - Sin `authUserId` → `NO_AUTENTICADO` y el asesor remite a la constancia del correo.
  - Con sesión → `libro_reclamaciones WHERE tiendaId AND authUserId`, últimas 3, o por número si lo dio. Una hoja ajena se trata como `NO_ENCONTRADA`.
  - Devuelve `{ numero, tipo, estado, fechaLimite, fechaRespuesta }` y el link a la constancia firmado al vuelo (`firmarTokenHoja`). **Nunca** devuelve el texto de la respuesta ni los datos personales: para leerlos está la constancia.
- Las hojas registradas sin sesión no aparecen (no tienen `authUserId`). Es aceptable: esas personas tienen la constancia por correo.

### Decisiones (R9)

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| La IA redacta, la persona envía | La respuesta es irreversible (trigger) y tiene efecto legal | Herramienta que responda directamente |
| La IA pregunta el remedio, no lo decide | Ofrecer un reembolso compromete dinero de la tienda | Que la IA proponga la solución "más justa" |
| Borrador como botón, no guardado en BD | Cero cambios de esquema; un borrador viejo no debe quedar disponible para enviarse días después sin releerlo | Columna `borrador` en la hoja (además chocaría con el trigger de inmutabilidad) |
| Redacción en una llamada aparte con prompt fijo | Límite de tokens del chat, reglas estables y aislamiento del texto del consumidor | Que la Guía escriba el borrador en el chat |
| Lista blanca de campos hacia el modelo | Minimización (Ley 29733): documento, domicilio y contacto no aportan a la redacción | Mandar la hoja completa y "pedirle" que no use datos personales |
| Herramienta de redacción oculta a editor/viewer | El modelo no ofrece lo que el usuario no puede hacer | Mostrar el botón y fallar al enviar |
| El asesor del storefront solo deriva y consulta hojas propias | No se puede registrar una hoja sin la declaración del consumidor; buscar por número permitiría ver hojas ajenas | Registrar la hoja desde el chat / consulta por número sin sesión |

### Riesgos (R9)

- **Inyección en el detalle.** Mitigada por diseño (sin herramientas de escritura y revisión humana). El caso real a vigilar es un borrador que repite una promesa que el consumidor "pidió" como si la tienda la aceptara: el prompt de redacción exige que la acción adoptada salga **solo** de `solucion`, y los tests incluyen un detalle con instrucciones embebidas.
- **Exceso de confianza.** El admin puede enviar sin leer. Por eso la etiqueta "revísalo antes de enviar" y la vista previa obligatoria, que ya existe.
- **Calidad con Haiku.** Si los borradores salen flojos, se sube solo `LIBRO_IA_MODELO`.
- **Cuota.** Una redacción cuesta más tokens que una consulta normal. Si se vuelve relevante, se cuenta como recurso propio en `consumo-ia`.

## Decisiones

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| Libro siempre activo, sin opción de apagarlo | Es obligatorio para toda tienda que vende online; un switch solo crea la forma de incumplir | Activarlo desde la configuración |
| Tabla propia con columnas tipadas, no `Json` | El formato del Anexo I es fijo, hay que exportarlo a CSV, filtrarlo y protegerlo con CHECK y trigger | `datos Json` (flexible pero sin garantías) |
| Snapshot del proveedor en la hoja | La hoja es un documento: debe mostrar el RUC y la razón social vigentes al registrarse | Join con `tiendas` al leer |
| Inmutabilidad con trigger SQL, no solo en el servicio | Ni un bug, ni un script, ni Prisma Studio pueden alterar una hoja | Confiar en que ningún endpoint haga UPDATE |
| FK a `tiendas` con `RESTRICT` | Las hojas deben durar 2 años aunque la tienda "se borre"; se usa `tiendas.activo` | `CASCADE` (borraría evidencia legal) |
| Correlativo por tienda y año con advisory lock | Es el patrón ya probado de `numeroPedido`; legible para el consumidor | Secuencia de Postgres por tienda (una por tenant, difícil de administrar) |
| `fechaLimite` guardada, semáforo calculado | El plazo comunicado no debe moverse; el semáforo depende de "hoy" | Calcular el plazo siempre al leer |
| Feriados en una lista estática en código | Cambian ~1 vez al año, cero dependencias, testeable | API externa de feriados (otro punto de falla) |
| Sin cron: alertas al leer (badge) + correo inmediato a la tienda | Railway free duerme; un `setInterval` no corre si el servidor está dormido | `node-cron` en el proceso |
| Sin captcha; rate limit + honeypot | El reglamento prohíbe poner barreras; el volumen esperado es bajo | reCAPTCHA / Turnstile (se puede agregar si aparece spam real) |
| Constancia imprimible en el navegador, sin PDF en el servidor | Cero dependencias (no hay librería de PDF), "Guardar como PDF" existe en todos los navegadores | `pdfkit`/`puppeteer` (peso y memoria en Railway) |
| Enviar el correo de respuesta dentro de la transacción | Si falla el correo, la hoja no queda "respondida" sin que el consumidor lo sepa; el lock evita doble envío | Enviar después del commit (podría quedar respondida sin correo) |
| `ipHash` y no la IP | Sirve para detectar abuso sin guardar un dato personal más | Guardar la IP en claro |

## Riesgos

- **Feriados desactualizados.** Si el Congreso agrega un feriado y no se actualiza la lista, el plazo calculado queda **un día antes** de lo real: es el error seguro (la tienda responde antes, no después). Mitigación: test que exige el año siguiente a partir de diciembre.
- **Cuota de Resend.** Cada hoja genera hasta 3 correos (constancia, aviso, respuesta). El free tier (100/día, 3 000/mes) se comparte con pedidos e invitaciones. Con el volumen actual no preocupa; se vigila en el dashboard de Resend.
- **Spam o abuso** (alguien llena el libro de una tienda competidora). El rate limit lo frena por IP; el `ipHash` permite identificarlo. Las hojas no se borran: el admin las responde como "registro improcedente" (no hay un estado especial a propósito).
- **Cambios del reglamento.** Los textos legales viven en una constante compartida (backend para correos, frontend para la página). Cambiar el formato es tocar un solo lugar por repo.
- **Cold start del backend.** La primera hoja tras horas de inactividad puede tardar 10–30 s. El botón queda en "Registrando…" y no permite doble envío.
- **Datos legales vacíos.** Una tienda sin RUC muestra un libro incompleto. No se bloquea al consumidor; se insiste en el admin (R7.1).

## Archivos

**BackendNode**
- `prisma/schema.prisma`: `libro_reclamaciones`, `libro_reclamaciones_eventos`, relaciones en `tiendas` y `pedidos`.
- `docs/sql/libro_reclamaciones_setup.sql`: DDL + CHECK + trigger + RLS.
- `modules/libro-reclamaciones/plazos.js`: feriados y días hábiles.
- `modules/libro-reclamaciones/libro.schema.js`: Zod (store y admin).
- `modules/libro-reclamaciones/libro.service.js`: registrar, listar, resumen, detalle, responder, exportar.
- `modules/libro-reclamaciones/libro.serializer.js`: DTO store / admin / CSV.
- `modules/libro-reclamaciones/libro.token.js`: firmar y verificar el token de la constancia.
- `modules/libro-reclamaciones/libro.store.routes.js`, `libro.admin.routes.js`.
- `modules/libro-reclamaciones/textos-legales.js`: textos del formato y definiciones.
- `modules/libro-reclamaciones/__tests__/`: plazos, correlativo concurrente, inmutabilidad, rutas.
- `services/email.service.js`: 3 correos + `replyTo` en `deliverEmail`.
- `routes/store/index.js`, `routes/admin/index.js`: montaje.
- `config/index.js`: `config.libro` (`LIBRO_LINK_SECRET`, `LIBRO_LINK_TTL_DIAS`, `LIBRO_RATE_LIMIT_MAX`, `LIBRO_IP_SALT`).

**FrontendStore**
- `src/app/features/claims-book/**`, `src/app/models/libro-reclamaciones.model.ts`.
- `src/app/shared/components/claims-book-link/`.
- `src/app/features/store/store.routes.ts`: 2 rutas lazy.
- `src/app/features/store/components/store-footer/store-footer.component.ts`: enlace fijo.
- `account-page` y `order-tracking-page`: enlace.
- Estilos `print:` en `store-layout` para ocultar el chrome al imprimir.

**FrontendAdmin**
- `src/app/pages/libro-reclamaciones/**`, servicios y modelo.
- `src/app/app.routes.ts`, menú en `shared/layout`, aviso en `dashboard`.
