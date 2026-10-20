# Arquitectura en diagramas

Los diagramas se escriben como texto: viven con el código, se revisan en cada commit y GitHub los muestra.
Las convenciones de código siguen en [`docs/ARQUITECTURA.md`](../ARQUITECTURA.md).

| Qué | Herramienta | Dónde se ve |
|---|---|---|
| Vista rápida (abajo) | Mermaid | Aquí mismo, en GitHub |
| Modelo completo, con vistas navegables | LikeC4 ([`modelo.c4`](modelo.c4)) | Sitio que genera la Action `arquitectura`, o en local |
| Flujos de una funcionalidad (secuencias, estados) | Mermaid | En su `docs/specs/<feature>/` |

## Contexto y contenedores

```mermaid
flowchart LR
  comprador([Comprador])
  dueno([Dueño / equipo de la tienda])
  plataforma([Admin de la plataforma])

  subgraph sistema[Ecommerce multi-tenant]
    store[FrontendStore<br/>Angular SSR · Vercel]
    admin[FrontendAdmin<br/>Angular · Vercel]
    app[App Transmitir<br/>celular]
    backend[BackendNode<br/>Express 5 · Prisma · Railway]
    db[(PostgreSQL<br/>Supabase)]
  end

  auth[Supabase Auth]
  storage[Supabase Storage / R2]
  resend[Resend]
  culqi[Culqi]
  stream[Cloudflare Stream / YouTube]
  ia[Anthropic · Gemini]

  comprador --> store
  dueno --> admin
  dueno --> app
  plataforma --> admin
  store -- /store --> backend
  admin -- /admin + JWT --> backend
  app -- QR + estado --> backend
  app -- video --> stream
  store -. Realtime .-> db
  admin --> auth
  backend --> db
  backend -- JWKS --> auth
  backend --> storage
  backend --> resend
  backend --> culqi
  backend --> stream
  backend --> ia
```

## Lógica por rubro

```mermaid
flowchart TB
  compartido[Módulos compartidos<br/>catalogo · reservas · dashboard · diseno · agente]
  registro[negocio/registro.js<br/>estrategiaDe tienda]
  bd[(rubro desde la BD<br/>tiendaDe)]
  compartido -- pregunta por capacidades --> registro
  registro --> bd
  registro --> productos & hotel & tours & eventos & locales & canchas
```

## Ver el modelo LikeC4

- **En local:** `npx likec4 start docs/arquitectura` abre el sitio con todas las vistas (contexto, contenedores, backend, rubros).
- **Validar:** `npx likec4 validate docs/arquitectura` (lo corre también la Action en cada push).
- **En GitHub:** la Action `.github/workflows/arquitectura.yml` arma el sitio y lo deja como artefacto descargable del run.
  Para publicarlo en GitHub Pages, ver el comentario al final de la Action (repo privado: requiere plan Pro o Team).
- **Editor:** la extensión "LikeC4" de VS Code muestra la vista previa y autocompleta.

## Cómo se mantiene

- Módulo, servicio externo o relación nueva: se agrega una vez en `modelo.c4` y aparece en todas las vistas.
- Rubro nuevo: va dentro de `negocio` en `modelo.c4`, igual que en el código.
