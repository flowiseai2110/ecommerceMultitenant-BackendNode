# Spec: varias sedes en una tienda (multi-sede)

> Estado (2026-10-17): **borrador para revisar**. Tareas: [tasks.md](tasks.md).
> Base: [perfil-negocio](../perfil-negocio/spec.md) (capacidad opcional del rubro), [layout-por-rubro](../layout-por-rubro/spec.md) (slots y rutas por rubro), [hotel-inventario](../hotel-inventario/spec.md), [recepcion](../recepcion/spec.md), [alquiler-canchas](../alquiler-canchas/spec.md).
> Relacionadas: [tienda-en-ssr](../tienda-en-ssr/) (SEO de las páginas de sede). Siguiente: **multi-sede-retail** (stock y entrega por sede, ver "Fuera de alcance").
> Repos: BackendNode, FrontendAdmin, FrontendStore.

## Por qué

Muchos hostales, hoteles y complejos de canchas tienen **varios locales**, con precios, disponibilidad y horarios distintos, pero una sola marca y una sola web. Hoy cada local tendría que ser una tienda aparte: otra URL, otro admin, clientes y reportes separados.

Lo que ofrece la competencia (revisado el 2026-10-16):

| Competidor | Multi-sede |
|---|---|
| Cloudbeds (hoteles) | El huésped busca en todo el grupo. La recepción reserva en un hotel hermano si el suyo está lleno. Tarifas y disponibilidad de todas las propiedades en una vista. |
| Mews (hoteles) | Un motor de reservas que ofrece las otras propiedades de la cadena, tarifas y vales en bloque, y usuarios en varias propiedades. Es un plan aparte ("Portfolio"). |
| Playtomic (canchas) | Cuenta de "cadena", monedero que sirve en cualquier club, y varias razones sociales con su facturación y cuenta bancaria (solo planes altos). |
| AlquilaTuCancha / Easycancha | Marketplaces: el club vive dentro de la app de ellos, no en su web. Multi-sede sin confirmar. |

**El hueco:** cada competidor cubre un solo vertical (Mews hoteles, Playtomic canchas, Shopify retail), y ninguno le da a una cadena peruana pequeña o mediana **su propia web multi-sede**. La propuesta es **un núcleo de sedes que sirve a varios rubros**, y cada rubro decide cómo lo usa.

Referencia de experiencia: Cinemark y Sodimac. Se entra a la marca, se elige el local y lo que se ve es de ese local.

## Rubros: dónde aplica y cómo

"Varias sedes" no significa lo mismo en cada rubro. Hay dos patrones de uso, y los rubros donde el lugar es un dato de cada ítem no lo necesitan.

| Rubro | ¿Aplica? | Modo | Se elige | Qué es de la sede |
|---|---|---|---|---|
| Hotel / hostal | Sí | `servicio` | `al-entrar` | Tipos de habitación, habitaciones, cupo, horarios, recepción y caja |
| Canchas | Sí | `servicio` | `al-buscar` | Canchas, ocupaciones, horario de apertura |
| Productos (retail) | Sí, en **multi-sede-retail** | `stock` | `al-comprar` | Stock, precio especial, recojo y despacho |
| Tours | No | — | — | Cada tour ya tiene su punto de encuentro e itinerario |
| Eventos | No | — | — | El lugar es un dato del evento o de la función |
| Alquiler de locales | No | — | — | Cada salón ya es un lugar con su dirección |

- **`servicio`:** la sede **contiene** los recursos, y el cliente consume en ella.
- **`stock`:** el catálogo es común, y la sede **guarda stock y entrega**.

**Se elige:**
- **`al-entrar`** (hotel): el huésped primero decide la ciudad o el hotel. Al entrar sale "¿A qué hotel vas?".
- **`al-buscar`** (canchas): la persona busca primero el día, la hora y el formato ("somos 14, jueves 8 pm"), y después el lugar. La entrada es una grilla con **todas las sedes a la vez**.
- **`al-comprar`** (retail): en la ficha del producto ("disponible en tu tienda") o en el checkout ("¿dónde lo recoges?").

## Decisión de arquitectura

**La sede vive dentro de la tienda.** Es el patrón de Square y de Shopify (las *Locations* dentro del negocio) para una sola marca con varios locales: el cliente ve una web, un diseño, una cuenta y elige el local.

El patrón contrario (cada local es la unidad y hay un grupo encima: Mews, OPERA, Toast, Shopify Plus) sirve cuando cada local es casi un negocio aparte o son **marcas distintas**. Para compartir algo obliga a mecanismos explícitos: perfiles compartidos, plantillas copiadas a cada propiedad o accesos de portafolio. En este producto lo común (la marca) es lo principal, así que ese patrón no aplica aquí. Sí aplica encima de la tienda, para varias marcas de un mismo dueño (ver "Organización").

### Modelo

```
Organización (futuro, opcional) ─ varias marcas de un dueño: usuarios, facturación del SaaS, reporte del grupo
  └─ Tienda (la marca, tenant) ─ web, diseño, textos, idiomas, clientes, catálogo, cupones, políticas, plan
       └─ Razón social (RUC) ─ datos fiscales, cobro (pasarela y métodos), comprobantes, libro de reclamaciones
            └─ Sede (el local) ─ recursos físicos, disponibilidad, horarios, reservas, recepción y caja
```

### Invariantes

- **I1. Toda tienda tiene al menos una sede y una razón social.** La migración crea una "sede principal" y una razón social con los datos fiscales de hoy. `sede_id` es `NOT NULL` en las tablas de la sede: no hay rama "¿es multisede?". Con una sola sede, o en un rubro sin la capacidad, la tienda se ve y funciona como hoy. Por ejemplo, las reservas de tours llevan la sede principal y nadie lo nota.
- **I2. Dónde vive cada dato lo dice un solo registro**, `ALCANCE` (S2). Una tabla nueva se registra ahí o el test de contrato falla.
- **I3. Una reserva pertenece a una sede.** Se fija al crearla (desde el recurso) y no cambia. Cambiar de sede es cancelar y reservar de nuevo, o una reserva entre sedes (S9.3).
- **I4. El alcance por sede es central**, igual que el de tienda: contexto del request, auto-scope de Prisma alimentado por `ALCANCE`, y test de contrato. Los servicios no filtran a mano.
- **I5. Lo que se ofrece en varias sedes se define una vez.** Se guarda en la tienda con **presencia** (en qué sedes existe) y **override** (qué cambia en una sede), como en Square. Nunca como copias por sede, que con el tiempo se desalinean.
- **I6. El código compartido pregunta por la capacidad `sedes` del perfil, nunca por el rubro** (CLAUDE.md).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Cada sede es una tienda hija de una cadena** | Cada función futura tendría que decidir si algo es de la cadena o de la sede, con herencia repartida por el código. Diseño, clientes, cupones y plan quedan duplicados. Cruzar sedes (disponibilidad, cliente único, reportes) obliga a romper el aislamiento del tenant (`tienda_id` es el límite de seguridad). No sirve para retail. |
| **Varias tiendas con el mismo slug, agrupadas por el usuario de `usuario_tiendas`** | El grupo no existe como dato: cambiar el slug saca a una sede sin que nadie lo note. Ser miembro no es ser dueño: un contador o soporte en varias tiendas las mezclaría. "La tienda por defecto" no tiene un orden fijo. Arrastra todo lo de la fila anterior. `usuario_tiendas` sigue siendo para que un usuario maneje **marcas distintas**, y gana `sedes` dentro de cada una (S10). |
| **`organizacion` → muchas `tiendas` (cada tienda es una sede)** | Si lo común queda en cada tienda, es la tienda hija con otro nombre. Si se mueve a la organización, la organización pasa a ser el tenant: es este modelo, pero con una migración más grande y `tienda_id` significando "sede" en 60 tablas. La organización sí sirve, **encima** de la tienda y para multi-marca. |
| **Tabla maestro en la base de datos** ("¿clientes compartidos o por tienda?", configurable por cliente) | La fila compartida necesita un dueño, y ese dueño es el tenant. Cambiar el ajuste con datos cargados es una migración (fusionar o partir), no un clic. La seguridad quedaría configurable: 2ⁿ combinaciones imposibles de probar. Se conserva la idea como **registro en el código** (`ALCANCE`), y lo que de verdad varía por cliente se resuelve con presencia y override. |
| **Copiar temporadas o extras a cada sede** (plantillas de OPERA) | Las copias se desalinean. Se usa presencia y override (I5). |

## Requisitos

### S1. Sede y razón social (datos)

- **S1.1** Tabla `sedes`:
  - `id`, `tienda_id`, `razon_social_id`;
  - `nombre`, `slug` (único por tienda);
  - `direccion`, `referencia`, `ubigeo`, `lat`, `lng`;
  - `telefono`, `whatsapp`, `email`;
  - `fotos` (portada + galería), `horario_atencion`;
  - `codigo_establecimiento_sunat` (anexo de 4 dígitos, opcional);
  - `principal` (exactamente una por tienda), `activa`, `orden`, y la auditoría de siempre.
- **S1.2** Tabla `razones_sociales`: `tienda_id`, `ruc`, `razon_social`, `razon_comercial`, `direccion_fiscal`, `emite_factura`. Estos campos **salen** de `tiendas`:
  - la migración los copia a la razón social por defecto;
  - en la **pieza 1**, los lectores actuales (checkout, comprobante, libro) pasan a leer `razones_sociales`, para que haya una sola fuente desde el inicio;
  - las columnas de `tiendas` **no se borran** hasta comprobar que nadie las usa, para que la reversa (S17.4) no pierda datos.
- **S1.3** Una sede inactiva no se ve en la tienda ni acepta reservas nuevas. Sus reservas vigentes siguen en Admin y Recepción. No se puede desactivar la única sede activa.
- **S1.4** Las sedes **nunca se borran**, solo se desactivan (como Square con sus *Locations*): el historial, los reportes y los comprobantes las necesitan.
  - No se puede desactivar una sede con reservas futuras sin antes cancelarlas o derivarlas a otra sede (S9.3).
  - La página de una sede inactiva redirige a `/sedes`.
  - Los reportes permiten elegir sedes inactivas.

### S2. Registro `ALCANCE` y alcance por sede (kernel)

> **2026-10-17:** `ALCANCE` nace antes, en la pieza 1 de [antipatrones](../antipatrones/spec.md) (A1), solo con `tienda` y `global`. Esa pieza cierra S2.1, S2.2, S2.5 y S2.6 a nivel tienda. Esta spec le agrega los valores `sede`, `sede:<padre>`, `presencia` y `razon_social`.

- **S2.1** `kernel/tenant/alcance.js` declara, por cada tabla con `tienda_id`, dónde vive. Es la respuesta única a "¿dónde vive X?":

  | Valor | Significa | Filtro automático |
  |---|---|---|
  | `tienda` | De la marca | `tienda_id` |
  | `razon_social` | De la entidad legal | `tienda_id` (+ la razón social de la sede al cobrar o emitir) |
  | `sede` | Del local, con columna `sede_id` | `tienda_id` + `sede_id` |
  | `sede:<padre>` | Del local, heredado del padre (sin columna) | Por relación con el padre |
  | `presencia` | Se define en la tienda y se ofrece en varias sedes (S4) | `tienda_id` + presencia de la sede |

- **S2.2** `config/prisma.js` arma `TENANT_SCOPED_MODELS` y `SEDE_SCOPED_MODELS` desde `ALCANCE`, en lugar de listas a mano.
- **S2.3** El contexto del request (`req.tenant`, ALS de `kernel/tenant`) gana `sedeId` y `sedesPermitidas`.
  - Tienda: `?sede=<slug|id>`, validada contra la tienda.
  - Admin: `sedeId` en query o body (como `tiendaId`), validada contra la membresía (S10).
  - "Todas las sedes" (Admin y la grilla de canchas) filtra por `sedesPermitidas` o por las sedes activas.
- **S2.4** Escribir en una tabla `sede` exige una sede concreta. Con "todas", el backend responde 400 (`SEDE_REQUERIDA`).
- **S2.5** Test de contrato:
  - toda tabla con `tienda_id` está en `ALCANCE`;
  - toda tabla `sede` tiene la columna `sede_id`, y toda tabla `presencia` tiene sus columnas (S4.1).
  - Si falta clasificar una tabla nueva, el test falla.
- **S2.6** Se cierra un hueco actual: las tablas `hotel_*` (temporadas, extras, planes, cupo externo, habitaciones, estadías, cobros, turnos, caja, incidencias) no están en `TENANT_SCOPED_MODELS`. Al pasar a `ALCANCE` quedan cubiertas.
- **S2.7** El auto-scope cubre las lecturas y operaciones masivas, pero **no** `findUnique`, `update` ni `delete` por id, ni los `$queryRaw`. Por eso:
  - las escrituras por id validan que el registro sea de la sede (o de las sedes) del contexto;
  - todo `$queryRaw` de reservas, recepción y caja recibe la sede como parámetro obligatorio (revisión una por una en la pieza 1);
  - **tests negativos por endpoint**: un usuario de la sede A no lee ni modifica nada de la sede B (responde 403 o 404, nunca 200 con datos).
  - Postgres RLS por sede queda como defensa adicional, para evaluar después.

### S3. Clasificación inicial (`ALCANCE`)

| Alcance | Tablas |
|---|---|
| `sede` | `hotel_tipos_habitacion`, `cancha_canchas`, `reservas` (copiada del recurso), `hotel_estadias`, `hotel_cobros`, `hotel_turnos`, `hotel_caja_movimientos`, `hotel_incidencias`, `config_sede` (S5) |
| `sede:<padre>` | `hotel_modalidades`, `hotel_cupo_externo`, `hotel_habitaciones` (del tipo); `cancha_ocupaciones` (de la cancha); `reserva_partes`, `reserva_cuotas`, `reserva_cambios` (de la reserva); `cierres_fecha` con `producto_id` (del recurso); `resenas` (del producto: si es un recurso, la sede del recurso) |
| `presencia` | `hotel_temporadas`, `hotel_extras`, `hotel_planes`, `cierres_fecha` sin `producto_id` (cierre de todo el local), `cupones` (S3.6) |
| `razon_social` | `metodos_pago`, `tienda_pasarela_config`, `libro_reclamaciones` (además guarda la sede si el reclamo es de un local) |
| `tienda` | `productos` y su catálogo (`categorias`, `marcas`, `producto_atributos`), `clientes`, `pedidos`, `pagos`, `config_reservas` (política comercial), `tienda_textos`, `metodos_envio`, `zonas_envio`, `agente_*`, `tours`, `tour_tipos_pasajero`, `eventos`, `evento_*`, `local_*` |

- **S3.1** Un `sede:<padre>` pasa a `sede` (con columna) solo si una consulta o restricción lo necesita, y se anota en `ALCANCE`.
- **S3.2** El producto de un recurso (la vitrina de una habitación o cancha) es de la tienda, y su sede sale del recurso. El slug sigue siendo único por tienda: al crear o clonar, el Admin propone el slug con el nombre de la sede (`doble-matrimonial-ica`).
- **S3.3** `tours`, `eventos` y `local_*` son `tienda` porque su rubro no tiene la capacidad: el lugar es un dato de cada ítem. Si un rubro activa la capacidad, se reclasifica en su spec.
- **S3.4** `resenas` ya es por producto, y el producto de una habitación o cancha es de una sede (S3.2). La reseña **hereda la sede del recurso**, sin columna nueva. En retail, la reseña de un producto común sigue siendo de la marca.
- **S3.5** **Paquetes del hotel** ([paquetes-hotel](../paquetes-hotel/spec.md), en borrador) usan `presencia`: un paquete existe en todas las sedes, en algunas o en todas menos algunas, con override de precio por sede. Se anota también en ese spec.
- **S3.6** **Cupones con presencia:** un cupón vale en todas las sedes (por defecto, como hoy), solo en algunas ("20 % por la inauguración de Ica") o en todas menos algunas. Al aplicarlo se valida con `enSede()` contra la sede de la reserva.

### S4. Presencia y override

- **S4.1** Una tabla `presencia` tiene:
  - `presencia` (`todas` | `solo` | `excepto`; por defecto `todas`) y `presencia_sedes UUID[]`.
  - Con `todas`, una **sede nueva ya la incluye**.
- **S4.2** Lo que puede cambiar por sede va en una tabla tipada `<tabla>_sede` (`<id>`, `sede_id` y solo los campos reemplazables; `NULL` = hereda):
  - `hotel_extras_sede`: `precio`, `activo`;
  - `hotel_temporadas_sede`: `ajuste` (el % o el monto), `activo`.
  - `hotel_planes` no tiene override en esta versión (solo presencia).
- **S4.3** Una función del kernel, `enSede(fila, sedeId)`, devuelve la fila efectiva en una sede (presencia + override). La cotización, la disponibilidad y el Admin la usan siempre: nadie combina presencia y override a mano.
- **S4.4** Si una temporada tiene **fechas distintas** en otra sede, es otra temporada con `presencia: solo`. Las fechas no son un override: así cada temporada tiene un solo rango.

### S5. Configuración por sede

- **S5.1** `config_sede` (una fila por sede) recibe los campos operativos que hoy están en `config_reservas`:
  - `hora_checkin`, `hora_checkout`;
  - `cancha_apertura`, `cancha_cierre`, `cancha_inicio_noche`, `cancha_finde_noche`, `cancha_duraciones`;
  - `hora_tope`, `visitas_horario`;
  - `instrucciones` (cómo llegar y qué traer);
  - `resenas_externas` (Google y TripAdvisor de ese local).
- **S5.2** Lo demás de `config_reservas` (cobro, adelanto, cancelación, términos, impuestos, formulario, tipo de cambio, cuotas…) sigue en la tienda: es la política de la marca.
- **S5.3** La migración copia los valores actuales a la `config_sede` de la sede principal. Al crear una sede, se copian de la sede de origen (S11.2) o de la principal.

### S6. Capacidad `sedes` en el perfil

- **S6.1** En `negocio/perfil-negocio.ts` (y su espejo en el backend):

  ```ts
  sedes: null | { modo: 'servicio' | 'stock'; seElige: 'al-entrar' | 'al-buscar' | 'al-comprar' }
  ```

  - hotel: `{ modo: 'servicio', seElige: 'al-entrar' }`;
  - canchas: `{ modo: 'servicio', seElige: 'al-buscar' }`;
  - productos: `null` hasta multi-sede-retail;
  - tours, eventos y locales: `null`.
  - `perfiles.spec.ts` lo fija.
- **S6.2** Con `null`, o con una sola sede activa, no aparece nada de sedes en la tienda ni en el Admin.
- **S6.3** Lo propio de cada rubro va en `negocio/<rubro>/`:
  - qué recursos son de la sede;
  - qué cuenta como "disponible" (cupo para fechas y ocupación, o un horario libre para día, hora y formato);
  - los textos ("¿A qué hotel vas?", "¿Dónde juegas?").
- **S6.4** Contrato para "disponible en otra sede", que cada rubro con `modo: 'servicio'` implementa con sus funciones de disponibilidad y cotización de siempre, sin copias: `disponibilidadEnSedes(busqueda) → [{ sede, hay, desde, detalle }]`.

### S7. Tienda (FrontendStore)

**Común a los rubros con la capacidad:**
- **S7.1** La sede elegida se guarda en el navegador (try/catch, como el resto) y va en la URL (`?sede=ica`), así un enlace compartido abre esa sede.
  - Precedencia: URL → recurso abierto (S7.3) → guardada → según el rubro (S7.6 / S7.7).
- **S7.2** Chip **"📍 Ica ▾"** en el header, que siempre está visible. Va en una pieza nueva `selectorSede` de `PiezasUi`, en las dos familias: `reserva` la dibuja y `comercio` la deja vacía. Se dibuja en `<app-slot-rubro>` sin hidratar, porque el SSR no conoce la tienda. `uis.spec.ts` lo fija.
- **S7.3** Abrir un recurso (una habitación, una cancha) **fija su sede** sin preguntar: el slug identifica la sede (S3.2).
- **S7.4** Todo lo que pide reservas (vitrina, disponibilidad, precios, calendario, cotización, solicitud, configuración) manda `sede`. Cambiar de sede refresca esos datos y conserva la búsqueda (fechas, ocupación, hora).
- **S7.5** Páginas `/sedes` (todas, con mapa) y `/sedes/:sedeSlug`:
  - fotos, dirección con mapa, horario, WhatsApp de la sede, cómo llegar y los recursos de la sede;
  - "Reservar aquí" fija la sede.
  - Llevan datos estructurados `schema.org` (Hotel, Hostel o SportsActivityLocation, con dirección y geo). Su SEO completo depende de [tienda-en-ssr](../tienda-en-ssr/).

**Hotel (`al-entrar`):**
- **S7.6** Si hay más de una sede activa, al entrar sale **"¿A qué hotel vas?"**: hoja inferior en el celular, diálogo en la computadora.
  - Cada sede muestra foto, nombre, ciudad o distrito, y desde cuánto cuesta la noche.
  - **"Usar mi ubicación"** ordena por distancia ("a 2.3 km"). Si se niega el permiso, se mantiene el orden del Admin.
  - Se puede cerrar sin elegir: se navega con la sede principal y el chip queda resaltado.

**Canchas (`al-buscar`):**
- **S7.7** No hay pregunta al entrar. El chip arranca en **"📍 Todas las sedes"**.
- **S7.8** Entrada principal: el buscador de día, hora y formato (fútbol 5/7/11, pádel…) devuelve una **grilla de todas las sedes**: cada fila es una sede (con su distancia, si se dio la ubicación) y cada celda una cancha u horario libre con su precio. Elegir una celda fija la sede y abre la reserva con todo ya puesto.
- **S7.9** Elegir una sede en el chip filtra la grilla a esa sede, y la vista de agenda de esa sede funciona como hoy.

**Para todos:**
- **S7.10** El seguimiento de la reserva, los correos y el comprobante muestran la sede: nombre, dirección, enlace al mapa y WhatsApp de la sede.
- **S7.11** "Mis reservas" del cliente lista las de todas las sedes, con la sede en cada una. El cliente ya es de la tienda, así que no hay nada que unir.
- **S7.12** Los textos van en el perfil del rubro (S6.3), no en ramas de la plantilla, y pasan por i18n.
- **S7.13** **Reseñas por sede:** la página de la sede, sus recursos y la vitrina de una sede muestran **solo las reseñas y la nota de esa sede**, nunca las de otras sedes ni un promedio de la marca. En la tarjeta de cada sede del selector y de `/sedes` va la nota de esa sede.
- **S7.14** **Caché por sede:** toda consulta de datos de una sede lleva `sedeId` en su clave (`QueryKeys`), y un test lo verifica. Al cambiar de sede no queda ningún dato de la anterior, y volver a una sede ya vista es instantáneo.
- **S7.15** **Confirmar la sede:** "Reservas en: Ica · {dirección}" va en el panel de la reserva, en el resumen antes de enviar o pagar, y en la confirmación. Es el reclamo típico de los sistemas multi-local ("reservé en Lima y era Ica").
- **S7.16** **SEO multi-local:**
  - `/sedes/:sedeSlug` es la URL canónica de cada sede, y las listas con `?sede=` apuntan a ella (`rel=canonical`).
  - Cada sede tiene una **descripción propia obligatoria**, para no tener páginas iguales cambiando solo la ciudad, y el **enlace a su perfil de Google** (Google Business Profile), que a su vez apunta a esa página.
  - El nombre, la dirección y el teléfono (NAP) salen de un solo lugar (`sedes`) para la página, el schema, el pie, los correos y el comprobante, siempre con el mismo formato.
- **S7.17** **Contacto con la sede:** con una sede elegida o una reserva abierta, todo contacto usa los datos de **esa sede**: el botón flotante de WhatsApp, el pie, el "escríbenos" del seguimiento y los correos al cliente. Sin sede elegida (canchas en "Todas"), se usan los de la tienda.
- **S7.18** **Idiomas:** los textos de `sedes` y `config_sede` (nombre visible, descripción, cómo llegar, horario) entran al mecanismo de traducciones que ya existe ([idiomas](../idiomas/)). Una tienda publicada en inglés muestra sus sedes en inglés.
- **S7.19** **Diseño:**
  - una sección **"Nuestras sedes"** para el home componible (tarjetas con foto, ciudad, nota y "Reservar aquí"), en las dos familias de UI;
  - el editor de Diseño en vivo muestra la vista previa con la sede elegida, para que el dueño vea cómo se ve cada sede.
- **S7.20** **Accesibilidad** ([accesibilidad](../accesibilidad/)):
  - la hoja "¿A qué hotel vas?" atrapa y devuelve el foco, se cierra con Esc y anuncia su título;
  - la grilla de canchas se navega con teclado (flechas entre celdas), y cada celda se anuncia completa ("La Molina, cancha 2, jueves 8 pm, S/ 90, libre");
  - el chip de sede tiene nombre accesible ("Sede: Ica, cambiar").

### S8. Ninguna reserva perdida

- **S8.1** Endpoint `GET /store/reservas/disponibilidad-sedes` con la búsqueda del rubro. Llama al contrato S6.4 y devuelve, por sede activa, si hay disponibilidad y desde cuánto.
- **S8.2** Hotel: si la sede elegida no tiene disponibilidad para las fechas y la ocupación, se ofrecen las otras con disponibilidad (*"Lima está lleno esas fechas · Ica tiene 3 habitaciones · desde S/ 180"*), con un botón que cambia de sede y conserva la búsqueda.
- **S8.3** Canchas: la grilla de S7.8 ya es esta función. Con una sede elegida y sin horario libre, se sugieren las otras sedes a esa hora y, si no hay, la hora libre más cercana.

### S9. Admin: sedes

- **S9.1** Configuración › Sedes: lista, crear, editar (S1.1 y S5.1), ordenar, activar o desactivar, y marcar la principal.
- **S9.2** Selector de sede global, con "Todas" + cada sede permitida. Las pantallas operativas (Reservas, Recepción, Habitaciones o Canchas, Calendario, Caja) usan la sede elegida. Con "Todas", las listas muestran la columna Sede y crear pide elegirla (S2.4). Es la misma experiencia que hoy cambiar de tienda.
- **S9.3** Recepción: sin cupo, "Ver otras sedes" (S8.1) crea la reserva en la sede hermana con los datos del huésped ya llenos (como el *inter-property booking* de Cloudbeds). La reserva queda en la sede de destino y muestra "Derivada desde Lima".
- **S9.4** En temporadas, extras, planes y cierres del local, el formulario muestra **"Disponible en: todas | solo estas | todas menos estas"** (S4.1) y, por sede, lo que cambia (S4.2).
- **S9.5** Con una sola sede, el selector y los campos de presencia no se ven. Configuración › Sedes muestra solo la principal con "Agregar sede".
- **S9.6** **Qué difiere entre sedes:** una vista compara las sedes (precios de extras, temporadas, horarios de `config_sede`) y marca lo que tiene override, para que la configuración no se desalinee sin que nadie lo note. Historial de cambios por sede: quién, qué y cuándo.
- **S9.7** Recepción y Caja muestran siempre la sede en la cabecera, y el turno de caja queda atado a su sede. No se cobra ni se abre caja con "Todas".
- **S9.8** **Mover una reserva ya pagada a otra sede** (excepción a I3, la hace el personal, con registro según S16.2):
  - **misma razón social:** se crea la reserva en la sede de destino, el pago pasa a ella y la original queda cancelada como "Movida a Ica";
  - **distinta razón social:** no se mueve el dinero entre empresas. Se devuelve al medio original (S16.8) y se cobra en la sede de destino, o se mantiene la reserva original.
  - El cliente recibe un nuevo enlace de seguimiento.

### S10. Personal por sede

- **S10.1** `usuario_tiendas.sedes` (`UUID[]`): vacío significa todas. Se elige al invitar o editar un usuario.
- **S10.2** Un usuario con sedes limitadas solo ve esas sedes en el selector del Admin y en Recepción. El backend lo valida (S2.3), no solo la UI.
- **S10.3** `owner` y `admin` de la tienda ven siempre todas.
- **S10.4** **Avisos por sede:** los correos y avisos al personal (reserva o solicitud nueva, pago o captura recibida, check-in en línea, cancelación) van a los usuarios con acceso a **esa sede**, además del owner. La recepción de Lima no recibe lo de Ica. Lo mismo vale para el push de las apps cuando exista ([apps-moviles](../apps-moviles/spec.md) B1).

### S11. Panel consolidado y alta rápida

- **S11.1** Dashboard con "Todas": ingresos, reservas, ocupación (hotel) o uso de canchas, por sede y en total, con comparación entre sedes en el mismo periodo. Exportar a Excel con la columna Sede.
- **S11.2** **Clonar sede:** copia de otra sede los recursos (con fotos) y `config_sede`. Lo que tiene presencia `todas` ya aplica solo, sin copiar nada (I5). Los slugs se proponen con el nombre de la sede nueva.

### S12. Precios en bloque

- **S12.1** Subir o bajar un % los precios de los recursos de varias sedes a la vez, con vista previa antes de confirmar.
- **S12.2** Una temporada o un extra nuevo con presencia `todas` ya es "en bloque" (S4).

### S13. Razones sociales

- **S13.1** Configuración › Razones sociales: una tienda puede tener varias. Cada sede pertenece a una.
- **S13.2** Cada razón social tiene sus métodos de pago (su Yape o Plin, sus cuentas) y su pasarela. Al pagar una reserva se usan los de la razón social de la sede.
- **S13.3** El comprobante sale con el RUC y los datos de la razón social de la sede, y con el código de establecimiento de la sede si existe.
- **S13.4** El libro de reclamaciones muestra los datos de la razón social y guarda la sede si el reclamo es de un local.
- **S13.5** Con una sola razón social (el caso de hoy), nada cambia para la tienda.
- **S13.6** Cada pago guarda la razón social que cobró. Las devoluciones y las notas de crédito salen **siempre por esa**, aunque la sede cambie de razón social después.
- **S13.7** Cuando se emitan comprobantes: series por sede (establecimiento anexo SUNAT, por ejemplo B001 en Lima y B002 en Ica). No se puede dar de baja una sede con series activas, porque SUNAT exige dar de baja primero las series del establecimiento (R.S. 316-2017/SUNAT).
- **S13.8** **Webhooks de la pasarela:** con varias razones sociales hay varias cuentas de pasarela. Cada una tiene su URL de webhook (`/webhooks/pasarela/:razonSocialId`), o la cuenta se identifica antes de validar la firma, y la firma se valida con el secreto de **esa** cuenta. Un webhook que no coincide con ninguna cuenta se rechaza y queda en el registro.
- **S13.9** **El contrato es con quien cobra:** los términos, el seguimiento, el correo de confirmación y el comprobante nombran la razón social de la sede ("Servicio prestado por Hoteles del Sur S.A.C., RUC …").

### S14. Agente IA

- **S14.1** El agente conoce las sedes (dirección, horario, qué tiene cada una) y usa S8.1. Responde "¿cuál queda más cerca del estadio?" o "¿dónde hay cancha techada el jueves a las 8?" y lleva a la reserva con la sede fijada.

### S15. Rendimiento

El volumen no es el problema: un cliente típico tiene de 2 a 5 sedes, de 10 a 40 recursos por sede y algunos miles de reservas al año, y filtrar por sede **reduce** las filas leídas. Los riesgos son patrones de implementación:

- **S15.1** **Una consulta por tienda, nunca una por sede.** La disponibilidad entre sedes (S8.1) y la grilla de canchas (S7.8) consultan la tienda completa y agrupan por `sede_id` en memoria. Con el pool en 10 (`DB_POOL_MAX`) y `disponibilidadDetalle` lanzando 3 consultas en paralelo, una llamada por sede agotaría el pool con dos visitantes. Ninguna función recorre sedes lanzando consultas.
- **S15.2** **Solo lo necesario:**
  - en hotel, las otras sedes se consultan solo si la elegida no tiene disponibilidad, y solo con el "desde" del rango buscado, no el calendario del mes;
  - en canchas, un día y una franja de ±2 horas.
- **S15.3** Caché en memoria de 30 s por (tienda, búsqueda) para S8.1, invalidada al crear una reserva en esa tienda. La validación final sigue con bloqueo (`FOR UPDATE` o restricción de exclusión): un dato mostrado unos segundos viejo nunca produce una doble reserva.
- **S15.4** **Presencia y override en una consulta:** temporadas, extras y planes de la tienda para el rango, con `LEFT JOIN` al override de la sede. `enSede()` combina en memoria y nunca consulta la base de datos.
- **S15.5** **La sede siempre en la URL** (`?sede=`), nunca en headers ni cookies, en todo endpoint público cacheable: el edge de Railway cachea `Cache-Control: public` por URL. La disponibilidad y la cotización siguen sin caché pública. `GET /store/sedes` puede ser `public, max-age=60`. Las cachés en memoria del backend que dependan de la sede la incluyen en su clave.
- **S15.6** **Índices compuestos** `(tienda_id, sede_id, <fecha>)` en `reservas`, `hotel_cobros`, `hotel_turnos`, `hotel_incidencias` y `hotel_estadias`. Los de tablas grandes, con `CREATE INDEX CONCURRENTLY`, fuera de la transacción de la migración.
- **S15.7** **Nunca bloquear dos sedes en una transacción.** La reserva derivada (S9.3) es una transacción en la sede de destino. Así se evitan deadlocks.
- **S15.8** `ALCANCE` se convierte en `Set` una sola vez al arrancar. Las sedes permitidas viajan en la entrada ya cacheada de la membresía (`tienda-access`).
- **S15.9** Tienda:
  - la lista de sedes llega con la tienda o en un endpoint pequeño con caché pública;
  - la distancia se calcula en el navegador (haversine), sin llamar a ninguna API, y el permiso de ubicación se pide solo al tocar el botón;
  - la librería del mapa se carga solo en `/sedes`;
  - el selector y la grilla son chunks diferidos;
  - las fotos de las sedes van en miniatura.
- **S15.10** Panel consolidado: `GROUP BY sede_id` con los índices de S15.6 y un rango máximo de 12 meses. Una tabla de resumen diario solo si una medición lo justifica.
- **S15.11** **Prueba de carga** (`load-tests/`, k6, con `CDN=no`): una tienda con 5 sedes y 10 recursos por sede, con visitantes que alternan la grilla de canchas, "otras sedes" y la cotización. Presupuestos para aceptar las piezas 1, 5 y 6:
  - `disponibilidad-sedes`: p95 < 300 ms;
  - grilla de canchas de un día: p95 < 300 ms;
  - cotización con presencia y override: el mismo p95 que hoy (±10 %);
  - sin errores de conexión con pool de 10 y 50 visitantes a la vez.

### S16. Seguridad

Las sedes abren cuatro frentes nuevos: el empleado de una sede, la cuenta del dueño robada, los bots sobre la grilla de todas las sedes, y el cliente que manipula las peticiones. El riesgo más alto es el de adentro.

**Empleados (fraude interno y acceso entre sedes):**
- **S16.1** La caché de membresía (`tienda-access`, 5 min) **se invalida** al cambiar el rol, las sedes o el estado de un usuario. Un usuario desactivado o sin la sede pierde el acceso en la siguiente petición, no 5 minutos después.
- **S16.2** Ajustes de monto, anulaciones de reservas pagadas, devoluciones y derivaciones entre sedes:
  - exigen rol `admin`, o la aprobación de un admin cuando los hace otro rol;
  - quedan en un **registro inmutable** (quién, qué, cuándo, sede, monto, motivo), que nadie puede editar ni borrar desde la aplicación;
  - tienen un **reporte por sede y por usuario**, con comparación entre sedes en el mismo periodo. Una sede con anulaciones, ajustes o devoluciones muy por encima de las demás se marca para revisar.

**Cuenta del dueño robada:**
- **S16.3** Cambiar métodos de pago (Yape, Plin, cuentas), la pasarela o una razón social:
  - exige **volver a autenticarse**;
  - **avisa por correo** al owner y a los admins con el detalle ("Se cambió el Yape de la sede Ica por …", con fecha, usuario y dispositivo).
  - MFA recomendado para owner y admin, y **obligatorio** cuando la tienda tiene más de una razón social.

**Bots y abuso desde afuera:**
- **S16.4** **Denegación de inventario** (OWASP OAT-021): los apartados sin pagar de una tienda tienen un tope por franja (por ejemplo, el 30 % del inventario de esa fecha u hora en todas las sedes).
  - Al pasarlo, o ante una ráfaga, se pide un desafío invisible (Cloudflare Turnstile) solo a esas solicitudes.
  - El dueño recibe un aviso ("40 apartados sin pagar en 10 minutos").
  - Se suma al tope actual por WhatsApp o documento (`maxSolicitudesAbiertas`), que se evade rotando datos.
- **S16.5** Limitador propio para `POST /store/reservas/cotizar` (hoy sin limitador) y `GET /store/reservas/disponibilidad-sedes`, además de la caché de S15.3.

**Cliente que manipula las peticiones:**
- **S16.6** **La sede y el precio siempre los calcula el servidor**, desde el recurso (I3). Una `sede` que venga en el body se ignora para cotizar y reservar.
  - Al escribir se valida la presencia con `enSede()`: un extra, plan o temporada que no existe en esa sede da 400.
  - Un `?sede=` de otra tienda da 404 (S2.3).
  - Lo cubren tests negativos (S2.7).
- **S16.7** **Fórmulas de Excel** (CWE-1236): la función `celda` de `libro.serializer.js` (ya neutraliza `=`, `+`, `-`, `@`) pasa a un util compartido, y todo export (S11.1 y los que vengan) la usa. El nombre de un huésped no puede ejecutarse en el Excel del dueño.
- **S16.8** Las devoluciones van **solo al medio de pago original**. Para Yape o transferencia, solo a la cuenta de origen y con aprobación de un admin (refuerza S13.6). Es la estafa clásica de tarjeta robada: reservar, cancelar y pedir la devolución a otra cuenta.

**Configuración y código:**
- **S16.9** **RLS en cada tabla nueva** (`sedes`, `razones_sociales`, `config_sede`, `<tabla>_sede`) desde el SQL de la migración. `rls_hardening.sql` solo cubre las tablas que existen cuando se corre. Una verificación automática (test o script de despliegue) falla si alguna tabla pública queda sin RLS.
- **S16.10** Campos nuevos de la sede:
  - el enlace al perfil de Google se valida con https y una lista de dominios permitidos (`google.com/maps`, `maps.google.com`, `maps.app.goo.gl`, `g.page`, `business.google.com`): nunca `javascript:` ni otros dominios;
  - el mapa de cada sede se arma con `encodeURIComponent` de la dirección, como `location-section`;
  - los textos largos (descripción, cómo llegar) pasan por el pipe `textoRico` y la sanitización de Angular.
  - Cuando la tienda se dibuje en el servidor (tienda-en-ssr), el JSON-LD se serializa escapando `<` como `<`, para que un `</script>` en la descripción no rompa la página.
- **S16.11** La ubicación del cliente **nunca se envía al servidor** (S15.9). Se dice así en la política de privacidad.

### S17. Despliegue, reversa y operación

- **S17.1** **Requisito previo:** la pieza 1 empieza con los tres repos **sin cambios pendientes**. El trabajo abierto en reservas (motor de reservas M1/M2 con el SQL de `cupo_externo`, ciclo de la reserva, mejoras de la reserva, ocupación del buscador) se prueba, se corren sus SQL y se hace commit por función antes de empezar. Toca los mismos archivos que la pieza 1.
- **S17.2** **Compatibilidad hacia atrás:** el backend nuevo funciona con el front y las apps de hoy ([apps-moviles](../apps-moviles/spec.md) B3).
  - Una petición sin `sede` usa la **sede principal** en lecturas y escrituras de una sede, y **todas las sedes permitidas** en las listas del Admin.
  - `sede` es siempre opcional en la API pública mientras exista una versión que no la mande.
- **S17.3** **Orden de despliegue:** backend → Admin → tienda. Cada uno funciona con la versión anterior del siguiente. El SQL se corre antes del deploy del backend que lo usa.
- **S17.4** **Reversa:**
  - respaldo de la base antes de correr el SQL de cada pieza;
  - cada SQL tiene su reversa (`multi_sede_fase_N_reversa.sql`), que quita lo nuevo sin tocar lo de antes;
  - las columnas viejas (S1.2) no se borran mientras se pueda necesitar volver atrás.
  - Se prueba la ida y la vuelta en una copia de la base antes de producción.
- **S17.5** **Observabilidad:** los errores, trazas y logs llevan la etiqueta `sedeId` en Sentry, junto a `tiendaId` (como `setContextTiendaId`). Las métricas de rendimiento (`performance.middleware`) también la registran.
- **S17.6** **Datos demo:** un script crea las dos tiendas demo de dos sedes (hotel Lima/Ica y canchas Surco/La Molina) con recursos, temporadas y reservas. Sirve para la demo de venta, las pruebas en el navegador y la prueba de carga (S15.11).
- **S17.7** **Sede principal incompleta:** varias tiendas no tienen dirección cargada. La migración crea la sede igual, y el Admin pide completar dirección y ubicación antes de agregar una segunda sede.
- **S17.8** **Analítica:** los eventos de Meta Pixel y Google Analytics (`tracking.service`) llevan la sede, para medir campañas por local.
- **S17.9** **Sitemap:** incluye `/sedes` y `/sedes/:sedeSlug` de las sedes activas cuando exista la tienda en SSR ([tienda-en-ssr](../tienda-en-ssr/)).

## Piezas (en orden; cada una se verifica antes de la siguiente)

| # | Pieza | Repos | Cambia algo visible |
|---|---|---|---|
| 1 | `sedes`, `razones_sociales`, `config_sede`; migración a la sede principal; `ALCANCE` + auto-scope + test de contrato (S1–S3, S5) | Backend | No: la tienda y el Admin se ven igual |
| 2 | Presencia y override (S4) en temporadas, extras, planes y cierres | Backend | No |
| 3 | Admin: Configuración › Sedes, selector, pantallas operativas con sede, formularios de presencia (S9.1, S9.2, S9.4, S9.5) | Backend + Admin | Solo con 2+ sedes |
| 4 | Capacidad en el perfil + tienda común + hotel `al-entrar` (S6, S7.1–S7.4, S7.6, S7.10–S7.12) | Store + Backend | Sí |
| 5 | Ninguna reserva perdida: contrato S6.4, endpoint S8.1, hotel S8.2 | Backend + Store | Sí |
| 6 | Canchas `al-buscar`: grilla de todas las sedes (S7.7–S7.9, S8.3) | Store + Backend | Sí |
| 7 | Páginas de sede (S7.5) | Store | Sí |
| 8 | Personal por sede (S10) + panel consolidado (S11.1) | Backend + Admin | Sí |
| 9 | Clonar sede (S11.2) + precios en bloque (S12) + reserva entre sedes en Recepción (S9.3) | Backend + Admin | Sí |
| 10 | Razones sociales (S13) | Los tres | Solo con 2+ razones sociales |
| 11 | Agente IA con sedes (S14) | Backend | Sí |

**Demo para vender:** piezas 1–7, con dos tiendas demo de dos sedes cada una (un hotel Lima/Ica y canchas Surco/La Molina). Las piezas 8–11 van como hoja de ruta.

## Decisiones tomadas

- **Reseñas (2026-10-17):** cada sede muestra solo sus reseñas, nunca las de otras sedes (S3.4, S7.13).
- **Plan (2026-10-17):** pospuesto a propósito. El usuario lo analiza al final, para buscar la mayor rentabilidad. Mientras tanto no hay límite de sedes por plan.

## Riesgos

- **Trabajo sin commit en los mismos archivos:** S17.1.
- **Front o apps viejas contra el backend nuevo:** S17.2 y S17.3.
- **La migración toca muchas tablas en producción.** Va en un solo SQL idempotente con transacción (como `canchas_fase_1.sql`): crea la sede principal, llena `sede_id` y recién después pone `NOT NULL`. Se prueba antes en una copia de la base.
- **Consultas que no pasan por el auto-scope** (`$queryRaw` de disponibilidad y cotización): se revisan una por una en la pieza 1 y se cubren con tests de dos sedes.
- **Presencia y override mal combinados a mano:** se evita con `enSede` (S4.3) como único camino y con tests.
- **Restricciones de exclusión** (`ex_cancha_ocupacion`): son por cancha, y la cancha ya es de una sede, así que no cambian.
- **Hidratación:** todo lo que depende de la sede se dibuja dentro de un slot sin hidratar (S7.2).
- **Grilla de canchas con muchas sedes:** S8.1 calcula todas las sedes en una consulta por tienda, no una por sede (S15.1).
- **Datos de otra sede en pantalla** (caché del navegador o del CDN sin la sede en la clave): S7.14 y S15.5.
- **Reservar en la sede equivocada:** S7.15.
- **Fraude interno y cuenta del dueño robada:** S16.1–S16.3.
- **Bots que bloquean el inventario de todas las sedes:** S16.4.

## Fuera de alcance

- **multi-sede-retail** (siguiente spec, sobre este núcleo y sin cambiarlo): productos con `sedes: { modo: 'stock', seElige: 'al-comprar' }`:
  - stock por sede (`producto_stock_sede`) y precio especial por sede (override);
  - "disponible en tu tienda" en la ficha;
  - recojo en tienda (retoma `recojo-tienda`) y despacho desde la sede, con la sede de despacho o recojo en el pedido;
  - zonas de envío por sede;
  - "no hay aquí, sí en Surco" con stock en vez de cupo.
- **Plan multi-sede** (sedes incluidas y precio por sede adicional): lo decide el usuario al final. El límite se aplicará con `tienda_uso_recursos`, como los otros límites del plan.
- **Organización** (varias marcas de un dueño): capa encima de la tienda, cuando un cliente lo pida. No cambia este modelo.
- Dominio propio por tienda o por sede (otro spec).
- Sedes en tours, eventos y alquiler de locales (S3.3).
- Monedero o bonos de la cadena (por ejemplo, horas de cancha que sirven en cualquier sede): spec propio.
- Políticas comerciales distintas por sede: si un cliente lo pide, se agrega como override explícito (S4) de esos campos.
- Moneda o zona horaria distinta por sede.

## Referencias (investigación del 2026-10-17)

- Square: presencia por local (`present_at_all_locations`, `present_at_location_ids`, `absent_at_location_ids`) y `location_overrides`. Fuente: [foro de desarrolladores](https://developer.squareup.com/forums/t/catalog-api-call-not-returning-location-override-for-modifiers/13784) y [ModifierLocationOverrides](https://developer.squareup.com/reference/square/objects/ModifierLocationOverrides). Confirmar en la referencia oficial de Catalog.
- Shopify: `Location` e `InventoryLevel` por producto y local ([docs](https://shopify.dev/docs/api/admin-rest/latest/resources/inventorylevel)); la *Organization* de Plus agrupa tiendas independientes ([help](https://help.shopify.com/en/manual/organization-settings)).
- Mews: *enterprise* = propiedad, la cadena comparte perfiles de clientes y el portafolio da acceso a varias ([multi-property](https://docs.mews.com/connector-api/concepts/multi-property), [perfiles](https://help.mews.com/s/article/create-a-customer-profile)).
- Oracle OPERA: plantillas de la cadena copiadas o distribuidas a cada propiedad ([docs](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.1/ocsuh/t_copying_configurations_to_multiple_properties.htm)).
- Toast: *management group* de restaurantes y versiones de configuración por local ([identificadores](https://doc.toasttab.com/doc/devguide/portalToastIdentifiers.html)).
- Odoo: multi-empresa para entidades legales y multi-almacén dentro de una empresa ([guía](https://www.odoo.com/documentation/18.0/developer/howtos/company.html)).

Problemas clásicos de los sistemas multi-local (investigación del 2026-10-17), que originaron S1.4, S2.7, S7.14–S7.16, S9.6, S9.7, S13.6, S13.7 y S15:
- Fugas entre tenants por la capa de consultas y tests negativos: [Sourcery](https://sourcery.ai/security/categories/tenant_isolation), [Frugal Testing](https://www.frugaltesting.com/blog/how-to-test-saas-platforms-for-multi-tenant-data-isolation-failures), [incidente de Adobe Analytics 2025](https://aviatrix.ai/threat-research-center/adobe-2025-analytics-data-exposure-ingestion-bug).
- Inventario y asignación de local en Shopify: [Webgility](https://www.webgility.com/blog/shopify-multi-location-inventory).
- Desalineación de configuración entre sitios: [Scale Computing](https://www.scalecomputing.com/resources/the-drift-tax-configuration-variance-costs-multi-site-orgs).
- Perfiles duplicados en cadenas hoteleras: [Hospitality Net](https://www.hospitalitynet.org/news/4120457.html).
- Fechas y zonas horarias: [Koha bug 9031](https://bugs.koha-community.org/bugzilla3/show_bug.cgi?id=9031).
- Locales desactivados sin perder historial: [comunidad de Square](https://community.squareup.com/t5/Archived-Discussions-Read-Only/Historical-data-for-deleted-locations/m-p/146107).
- SEO multi-local: [SEO Tuners](https://seotuners.com/blog/local-seo/technical-seo-for-multi-location-brands-complete-guide/).
- Opciones de local que se pasan por alto en el checkout: [Baymard](https://baymard.com/checkout-usability/benchmark/step-type/store-pickup).
- Establecimientos anexos y series: [R.S. 316-2017/SUNAT](https://www.sunat.gob.pe/legislacion/superin/2017/316-2017.pdf).

Seguridad (investigación del 2026-10-17), que originó S16:
- OWASP API Top 10 2023, BOLA y BOPLA (asignación masiva): [ISACA](https://www.isaca.org/resources/news-and-trends/industry-news/2023/reviewing-the-2023-owasp-api-top-10), [Barracuda](https://blog.barracuda.com/2023/05/23/owasp-top-10-api-broken-object-property-level-authorization).
- Denegación de inventario (OWASP OAT-021): [F5](https://www.f5.com/glossary/owasp-automated-threats).
- Inyección de fórmulas: [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection), [CWE-1236](https://cwe.mitre.org/data/definitions/1236).
- Tablas de Supabase sin RLS: [UpGuard](https://www.upguard.com/blog/everything-everywhere-systemic-data-exposure-in-supabase-apps), [DeepStrike](https://deepstrike.io/blogs/hacking-thousands-of-misconfigured-supabase-instances-at-scale).
- Fraude interno en recepción: [Lodging Magazine](https://lodgingmagazine.com/curbing-occupational-fraud-promoting-culture-honesty/), [KPM](https://www.kpmcpa.com/internal-fraud-risk-at-the-front-desk/).
- Fraude con tarjetas y devoluciones a otra cuenta: [Cloudbeds](https://www.cloudbeds.com/hotel-cybersecurity/booking-scams), [Mews](https://www.mews.com/en/blog/preventing-hotel-chargebacks-fraudulent-charges).

## Para el manual

- **Sedes:** en Configuración › Sedes agregas cada local con su dirección, fotos, horario y WhatsApp. Para abrir una sede nueva rápido, clónala desde otra y ajusta lo que cambie.
- **Elegir la sede:**
  - en un hotel, el huésped elige el hotel al entrar (o el más cercano con su ubicación) y lo cambia desde el header;
  - en canchas, busca día y hora y ve todas tus sedes a la vez.
  - Un enlace a una habitación o cancha abre su sede sola.
- **Ninguna reserva perdida:** si una sede está llena, la tienda ofrece tus otras sedes con disponibilidad.
- **Una vez para todas:** una temporada, un extra o un plan se crea una vez y eliges en qué sedes aplica. Si en una sede cuesta distinto, cambias solo ese precio.
- **Tu equipo:** a cada usuario le das acceso a todas las sedes o solo a la suya.
- **Razones sociales:** si tus sedes facturan con distinto RUC, cada una cobra y emite comprobantes con el suyo.
- **Control y seguridad:**
  - cada anulación, ajuste, devolución o derivación queda registrada con el usuario y la sede, y puedes comparar las sedes en un reporte;
  - si alguien cambia una cuenta de cobro, te llega un correo al instante;
  - la ubicación de tus clientes nunca sale de su celular.
