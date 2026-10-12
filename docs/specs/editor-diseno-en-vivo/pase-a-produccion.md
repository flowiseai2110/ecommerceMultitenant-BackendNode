# Pase a producción: editor de Diseño en vivo (fases 1 y 2)

> Spec: [spec.md](spec.md). Todo lo de esta lista se hace a mano en Supabase, Railway, Vercel y el DNS: ningún despliegue lo hace solo.
> Servicios: backend en Railway, storefront y admin en Vercel, base en Supabase, dominio `ecompyme.com`.

## Resumen

| # | Dónde | Qué | Por qué |
|---|---|---|---|
| 1 | Supabase | Correr `docs/sql/plantillas_diseno.sql` | Tabla de plantillas creadas desde el editor (fase 2) |
| 2 | Railway (backend) | `PLATFORM_ADMIN_EMAILS=superadmin@yopmail.com` | Quién puede crear y editar plantillas |
| 3 | Railway (backend) | Desplegar el backend (`postinstall` genera el cliente de Prisma) | Endpoints `copia` y `plantillas`, modelo `plantillas_diseno` |
| 4 | Vercel (storefront) | `ADMIN_ORIGINS=<dominio del admin>` y volver a desplegar | Solo el admin puede mandar el borrador a la vista previa |
| 5 | Vercel + DNS | Dominio comodín `*.ecompyme.com`, o quitar `PLATFORM_BASE_DOMAIN` en Railway | Hoy toda tienda por subdominio da 404: la vista previa y "Ver mi tienda" no abren |
| 6 | Vercel (admin) | Desplegar el admin | Editor nuevo |
| 7 | Navegador | Lista de verificación de abajo | |

## Orden

Primero la base y el backend, después el storefront y por último el admin. Al revés, el admin nuevo pediría endpoints que el backend todavía no tiene.

### 1. Supabase: tabla de plantillas

1. SQL Editor → pegar y correr [docs/sql/plantillas_diseno.sql](../../sql/plantillas_diseno.sql).
2. Comprobar que la tabla existe y tiene RLS activo:
   ```sql
   select relname, relrowsecurity from pg_class where relname = 'plantillas_diseno';
   ```
   Debe responder `plantillas_diseno | true`.

El script se puede correr más de una vez (`IF NOT EXISTS`). Si el backend se despliega antes que la tabla, no se rompe: usa solo las plantillas del código y lo deja en el log ("No se pudieron leer las plantillas de diseño de la base"). Lo que no funciona en ese caso es guardar plantillas nuevas.

### 2. Railway: variables del backend

| Variable | Valor | Nota |
|---|---|---|
| `PLATFORM_ADMIN_EMAILS` | `superadmin@yopmail.com` (en local también `canchas@yopmail.com`) | Varios: separados por coma. Se compara sin mayúsculas. Sin esta variable nadie ve los controles de plantillas. |
| `PLATFORM_BASE_DOMAIN` | `ecompyme.com`, o vacía | Depende del paso 5. |
| `STOREFRONT_URL` | URL del storefront, ej. `https://ecompyme.com` | Solo se usa si `PLATFORM_BASE_DOMAIN` está vacía. |

El usuario `superadmin@yopmail.com` tiene que existir en Supabase Auth y ser **administrador** de al menos una tienda demo por cada tipo de negocio donde se vayan a crear plantillas. El editor de Diseño se abre desde una tienda, y la plantilla toma el tipo de negocio de esa tienda.

> Local: el `.env` de desarrollo tiene `PLATFORM_BASE_DOMAIN` comentado y `STOREFRONT_URL=http://localhost:4200` para que la vista previa abra la tienda local. **No copiar eso a Railway.**

### 3. Railway: desplegar el backend

- `npm install` corre `prisma generate` (`postinstall` del `package.json`), así que el despliegue ya incluye el modelo nuevo `plantillas_diseno`.
- Al arrancar, el backend carga las plantillas de la base y las vuelve a leer cada 5 minutos.

### 4. Vercel: storefront

1. Settings → Environment Variables → `ADMIN_ORIGINS` = origen del admin en producción, por ejemplo `https://admin.ecompyme.com`. Va sin barra final. Si hay más de un dominio, separarlos con coma.
2. Volver a desplegar. `scripts/generate-env.js` copia el valor a `environment.prod.ts` durante el build.

Sin `ADMIN_ORIGINS` funciona igual, pero cualquier página que meta la tienda en un iframe podría cambiar lo que se ve dentro de su propio iframe.

### 5. Tiendas por subdominio

Hoy `https://<slug>.ecompyme.com` responde `404 DEPLOYMENT_NOT_FOUND` de Vercel en **todas** las tiendas. El dominio llega a Vercel, pero ningún proyecto lo tiene asignado. `https://ecompyme.com/<slug>/` sí funciona. Hay que elegir una opción:

**A. Activar los subdominios (recomendado)**
1. Vercel → proyecto del storefront → Settings → Domains → agregar `*.ecompyme.com`.
2. En el DNS de `ecompyme.com`, crear el registro que pida Vercel. Normalmente es `CNAME  *  cname.vercel-dns.com`. Para comodines, Vercel puede pedir que los nameservers sean los suyos: seguir lo que indique la pantalla.
3. Esperar la verificación y el certificado SSL. Probar con `https://los-cedros.ecompyme.com/`.
4. Dejar `PLATFORM_BASE_DOMAIN=ecompyme.com` en Railway.

**B. Seguir por ruta mientras tanto**
1. En Railway, borrar `PLATFORM_BASE_DOMAIN` y poner `STOREFRONT_URL=https://ecompyme.com`.
2. Los enlaces (vista previa, "Ver mi tienda", correos de "califica tu compra") salen como `https://ecompyme.com/<slug>/`.

### 6. Vercel: admin

Desplegar. No necesita variables nuevas.

## 7. Verificación en producción

Con `superadmin@yopmail.com`, en una tienda demo:

- [ ] Diseño abre con la tienda en el centro, sin el aviso "Tu tienda está tardando en abrir".
- [ ] Cambiar el texto de la barra de anuncios se ve en la tienda sin guardar.
- [ ] Clic en una sección de la tienda abre su panel; elegir una parte en la lista la marca en la tienda.
- [ ] Estilo → "Probar" otra plantilla cambia la vista previa; Deshacer la revierte.
- [ ] Publicar guarda: la tienda pública (otra pestaña) muestra el cambio en un minuto.
- [ ] En Estilo aparece "Plataforma · solo tú ves esto".
- [ ] "Guardar como plantilla nueva" crea la plantilla. Con un usuario que no es administrador de la plataforma, en otra tienda del mismo tipo, aparece en la lista y se puede probar.
- [ ] Ocultar la plantilla nueva: ya no aparece para ese otro usuario. La tienda que la usa se sigue viendo igual.
- [ ] Ocultar la plantilla por defecto del tipo de negocio responde "no se puede ocultar".

Con un usuario normal: no aparece el recuadro de plataforma, y `GET /api/v1/admin/diseno/plantillas?tipoNegocio=productos` responde 403.

## Si algo sale mal

- **La vista previa no abre.** Revisar el paso 5 (la URL que arma el backend tiene que abrir sola en el navegador) y el paso 4 (el origen del admin escrito exacto, con `https://` y sin barra final).
- **Volver atrás.** Redesplegar las versiones anteriores del admin y del backend. La tabla `plantillas_diseno` puede quedarse: la versión anterior no la usa. Las tiendas que publicaron con una plantilla creada desde el editor se siguen viendo bien, porque tienen su propia copia.
