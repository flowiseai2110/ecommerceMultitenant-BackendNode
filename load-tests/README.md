# Pruebas de carga (k6)

Miden cuántos visitantes del **Store** y usuarios del **Admin** aguanta el
backend antes de que se ponga lento. Usan las tiendas sintéticas de
`scripts/seed-carga.mjs`.

> ⚠️ **Nunca contra producción.** Todo va contra un entorno de *staging*:
> un backend en Railway (o local) apuntando a un **proyecto Supabase de prueba**.
> El script se niega a correr si `BASE_URL` es el host de producción.

## 1. Preparar staging (una sola vez)

1. **Supabase de prueba:** crea un segundo proyecto (el plan Free permite 2) y
   crea las tablas con `npx prisma db push`
   usando su `DATABASE_URL`/`DIRECT_URL` (el proyecto está vacío, no hay nada que perder).
2. **Usuario del Admin:** en ese proyecto, *Authentication → Add user* con email
   y contraseña. Copia su **User UID**.
3. **Backend de staging:** un servicio en Railway (o `npm run dev` en local) con
   el `.env` del proyecto de prueba y un `SSR_API_KEY` cualquiera.
4. **k6:** instálalo desde <https://grafana.com/docs/k6/latest/set-up/install-k6/>
   (`brew install k6`, `choco install k6` o `winget install k6`).

## 2. Sembrar datos

```bash
# Con DATABASE_URL apuntando al proyecto de PRUEBA:
node scripts/seed-carga.mjs --confirmar <ref-prueba> \
  --tiendas 20 --pedidos 1000 --mensajes 3000 \
  --owner-user-id <User UID del paso 1.2>
```

Esto crea las tiendas, deja al usuario de prueba como `owner` de todas y
escribe `load-tests/data/tiendas-carga.json`, que k6 usa para recorrerlas.

## 3. Ejecutar

```bash
# Prueba de humo: 1 visitante + 1 admin durante 1 minuto (¿todo responde 200?)
k6 run -e BASE_URL=https://<staging>.up.railway.app \
       -e SSR_API_KEY=<el de staging> \
       -e SUPABASE_URL=https://<ref-prueba>.supabase.co \
       -e SUPABASE_ANON_KEY=<anon key de prueba> \
       -e ADMIN_EMAIL=<email> -e ADMIN_PASSWORD=<contraseña> \
       load-tests/prueba.js

# Carga sostenida: 30 visitantes simultáneos + 5 admins durante ~9 min
k6 run -e PERFIL=carga  ...mismas variables...  load-tests/prueba.js

# Escalones: sube hasta 150 visitantes en 5 pasos para ver dónde se rompe
k6 run -e PERFIL=escalones -e VUS_STORE=150 ...  load-tests/prueba.js

# Solo el Store (sin login de Admin)
k6 run -e ESCENARIOS=store -e BASE_URL=... -e SSR_API_KEY=... load-tests/prueba.js

# Guardar el resumen en JSON para comparar antes/después
mkdir -p load-tests/resultados
k6 run -e PERFIL=carga ... --summary-export=load-tests/resultados/carga-$(date +%F).json load-tests/prueba.js
```

| Perfil | Store | Admin | Duración | Para qué |
|---|---|---|---|---|
| `humo` | 1 VU | 1 VU | 1 min | Comprobar que todo responde antes de cargar |
| `carga` | sube a `VUS_STORE` (30) y se mantiene | `VUS_ADMIN` (5) | ~9 min | Tráfico normal esperado |
| `escalones` | 10 % → 25 % → 50 % → 75 % → 100 % de `VUS_STORE` (150) | 5 | ~21 min | Encontrar el punto de quiebre |
| `pico` | 0 → `VUS_STORE` (200) en 30 s | 5 | ~3 min | Campaña, Cyber, un post viral |

**Un VU del Store = un visitante navegando:** portada → catálogo → 1-3
productos → a veces prepara el checkout, con pausas de lectura (~30-60 s por
visita). 30 VUs ≈ 30 personas en las tiendas **al mismo tiempo**.

El Admin es **solo lectura** (dashboard, pedidos, productos, reseñas): la
prueba no modifica datos. Checkout, chat IA y escrituras quedan fuera a
propósito: crean pedidos, gastan tokens de IA o tienen límites anti-abuso propios.

## 4. Leer el resultado

k6 termina con ✓/✗ en los umbrales:

| Umbral | Valor | Ajustable con |
|---|---|---|
| p95 de las respuestas del Store | < 300 ms | `-e P95_STORE_MS=...` |
| p95 de las respuestas del Admin | < 500 ms | `-e P95_ADMIN_MS=...` |
| Errores HTTP | < 1 % | — |

- Si algo sale ✗, k6 termina con código ≠ 0.
- La tabla `http_req_duration` separa `{tipo:store}` y `{tipo:admin}`; cada
  endpoint aparece con su nombre (`store/productos/:id`, `admin/pedidos/lista`…).
- Mientras corre, mira a la vez: **Railway** (CPU/RAM), **Supabase → Reports /
  Query Performance** (CPU, conexiones, consultas lentas) y `/api/v1/metrics`
  (con `X-Metrics-Key`).

**El dato que buscamos:** con el perfil `escalones`, el número de visitantes
simultáneos en el que el p95 del Store pasa de 300 ms o aparecen errores.
Ese es el techo del plan actual.

## Por qué hace falta `SSR_API_KEY`

El backend limita a 1.000 lecturas cada 15 min **por IP**. k6 corre desde una
sola máquina: sin más, todas las visitas serían una sola IP y a los pocos
segundos todo devolvería 429 (comprobado: 98 % de errores). Con `SSR_API_KEY`,
k6 manda cada visita con una IP distinta en `X-Visitor-IP` (el mismo
mecanismo que usa el SSR del Store), así el límite se comporta como con
visitantes reales. Alternativa: subir `RATE_LIMIT_READ_MAX` en staging.

## Costos y cuidado

- **Railway:** una prueba de 20 min con 1 réplica cuesta centavos del crédito.
- **Supabase de prueba:** la carga consume CPU y egress del proyecto de prueba,
  no del de producción.
- **Desde dónde se lanza:** desde tu PC la latencia incluye tu conexión. Para
  medir desde la nube: `k6 cloud run` (Grafana Cloud k6, 500 VU-hora/mes gratis).

## Limpiar

```bash
node scripts/seed-carga.mjs --confirmar <ref-prueba> --limpiar
```
