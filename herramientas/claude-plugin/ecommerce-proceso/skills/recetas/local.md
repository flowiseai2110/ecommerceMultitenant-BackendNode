# Receta: levantar el entorno local

| Qué | Dónde | Comando | Puerto |
|---|---|---|---|
| Backend | BackendNode | `npm run dev` (nodemon) | 3000 |
| Tienda | FrontendStore | `npm start` | 4200 |
| Admin | FrontendAdmin | `npm start` (si 4200 está ocupado: `npm start -- --port 4300`) | 4200 / 4300 |

- **La tienda local llama al backend de producción** salvo que `FrontendStore/.env` tenga `PROXY_TARGET=http://localhost:3000`.
  Para probar un cambio del backend, ponlo antes de `npm start`.
- Corre los servidores en segundo plano y espera a que respondan (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health`),
  no con `sleep` a ciegas.
- El backend gratis de Railway se duerme tras horas sin uso: la primera llamada a producción puede tardar; no es un error del cambio.
