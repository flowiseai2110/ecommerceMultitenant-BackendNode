# Despliegue: <funcionalidad>

> Desde: `prod-AAAA-MM-DD` · Hasta: `<hash>` · Estado: pendiente | hecho

## Resumen
<Qué sale a producción, en una frase.>

## 1. Antes de desplegar
- [ ] Respaldo de la BD (si hay SQL)
- [ ] QA aprobado: [qa.md](qa.md)

## 2. Base de datos (Supabase › SQL Editor)
| Orden | Archivo | Qué hace | ¿Reversible? |
|---|---|---|---|

## 3. Llaves
| Plataforma › servicio | Llave | Acción | Valor / cómo generarlo | ¿Secreta? |
|---|---|---|---|---|
| Railway › backend | | agregar / cambiar / quitar | | |
| Vercel › tienda | | | | |
| Vercel › admin | | | | |

## 4. Orden
1. Backend (Railway) — esperar que levante: `GET /api/v1/health`
2. Admin (Vercel)
3. Tienda (Vercel)

## 5. Verificar en producción
- [ ] …

## 6. Si algo sale mal (reversa)
- …

## 7. Después
- [ ] Confirmar a Claude → crea el tag `prod-AAAA-MM-DD` en los repos desplegados
- [ ] Actualizar `docs/ESTADO.md`
