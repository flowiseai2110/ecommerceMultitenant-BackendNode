# Casos de uso del proceso con agentes

> Qué debería hacer la coordinación ante cada pedido típico de Diego. Sirve para revisar que el plugin
> `ecommerce-proceso` enruta bien: `herramientas/claude-plugin/evaluar-coordinacion.sh` le pasa cada pedido a una sesión nueva
> en modo simulación y guarda lo que decidió. Prefijo de los agentes: `ecommerce-proceso:`.

Tipos: **R** receta · **C** chica · **M** mediana · **K** crítica · **P** pregunta.

| # | Pedido de Diego | Tipo | Agentes esperados, en orden (modelo) | Recetas | Se detiene a pedir aprobación |
|---|---|---|---|---|---|
| 1 | "Quiero rediseñar el checkout de la tienda de productos porque se abandona mucho en el paso de envío" | M | `analista-productos` → `analista-requerimientos` → `disenador` → `arquitecto` (opus) → `desarrollador` → `qa` → `deployer` | version-diseno | Tras spec, diseño, plan, cada pieza y QA. Antes, pregunta si incluye el pago de las reservas |
| 2 | "Empieza la pieza 1 de multi-sede" | K | Revisa ESTADO (falta cerrar lo pendiente de reservas) → `desarrollador` (opus) → `qa` (opus) | sql, pruebas | Antes de empezar: avisa que la spec exige cerrar lo de reservas primero |
| 3 | "En el pie de la tienda dice 'Contactanos', corrígelo a 'Contáctanos'" | C | Ninguno: directo | — | No; avisa si el texto viene del perfil del rubro |
| 4 | "¿Qué cambió esta semana en los tres repos?" | P | `explicador` | — | No |
| 5 | "¿Cómo funciona el apartado de 15 minutos de la reserva del hotel?" | P | `explicador` | — | No |
| 6 | "Revisa la spec de paquetes del hotel para aprobarla" | M | `analista-hotel` (revisa contra las reglas del rubro) | — | Sí: Diego aprueba la spec; luego sigue `disenador` |
| 7 | "Quiero agregar un rubro nuevo: gimnasios con clases por horario" | K | `analista-requerimientos` → `disenador` → `arquitecto` (opus) → `desarrollador` (opus) → `qa` (opus) → `deployer`; propone crear `analista-gimnasios` | capacidad-rubro, pieza-ui | En cada etapa |
| 8 | "El hotel Nobility quiere cobrar 30 % de adelanto en vez del total" | C | Ninguno si alcanza la configuración por tienda (`cobro` y `adelantoPct` en la config de reservas); si falta algo, `analista-requerimientos` → `arquitecto` (opus) → `desarrollador` (opus: pagos) → `qa` | — | Antes de cambiar el dato de un cliente |
| 9 | "Necesito integrar la API de WhatsApp Business; ya tengo el token" | M | `analista-requerimientos` → `arquitecto` (opus) → `desarrollador` → `qa` → `deployer` | llave | Sí; nunca pide pegar el token en el chat |
| 10 | "Prepara el despliegue de lo que está listo" | R | `deployer` | — | Pide el commit de producción (no hay tags `prod-*`) |
| 11 | "Verifica el pendiente heredado de ESTADO.md" | P | `deployer` | — | Lista lo que Diego tiene que confirmar |
| 12 | "En producción el carrito está sumando mal el costo de envío" | K | `explicador` o diagnóstico directo → `desarrollador` (opus) → `qa` (opus) | pruebas | Antes de desplegar el arreglo |
| 13 | "El qa rechazó dos veces la pieza 2 de antipatrones, sigue" | K | `desarrollador` (opus) → `qa` | — | Tras el QA |
| 14 | "Haz commit de lo que hicimos" | R | Ninguno: directo | commit | No |
| 15 | "Que los tours ofrezcan recojo en el hotel como opción" | M | `analista-tours` → `analista-requerimientos` → `disenador` → `arquitecto` (opus) → `desarrollador` → `qa` → `deployer` | capacidad-rubro | En cada etapa |
| 16 | "Sube a 50 el límite de traducciones con IA para tiendas sin plan" | R | Ninguno: directo | parametro | No (o avisa que puede cambiarlo él en Parámetros de la plataforma) |
| 17 | "Implementa el diseño de plantillas para eventos" | M | Primero pregunta: no hay diseño de eventos en `disenos/INDICE.md`. Luego `analista-eventos` → `analista-requerimientos` → `disenador` → `arquitecto` (opus) → `desarrollador` → `qa` | version-diseno | En cada etapa; implementar = plantilla elegible en Admin › Diseño |
| 18 | "Ya publiqué el sitio, haz la auditoría de accesibilidad" | M | `qa` | — | Al entregar el resultado |
| 19 | "Actualiza lo que sabemos del rubro canchas" | M | `analista-canchas` | — | Al entregar `docs/rubros/canchas.md` |
| 20 | "Que el recordatorio de bitácora no salte cuando solo cambio tests" | C | Ninguno: directo | plugin | No; corre `verificar.sh` |

## Evaluaciones

| Fecha | Versión del plugin | Sesión principal | Resultado | Cambios que salieron |
|---|---|---|---|---|
| 2026-10-18 | 0.3.0 → 0.3.1 | sonnet | 18/20 bien a la primera; 2 con costo de más (6: lanzaba el `explicador` para resumir; 2: repetía el `arquitecto` con `tasks.md` ya aprobado). Tras corregir, 20/20. En 8 y 17 decidió mejor que lo esperado (se actualizó la tabla) | `coordinacion.md`: no repetir etapas hechas, no lanzar agentes para resumir, revisar specs en borrador con el analista del rubro |

Límite: es una simulación de la decisión de la sesión principal (qué agentes, modelo, recetas y paradas); no ejecuta los agentes.
