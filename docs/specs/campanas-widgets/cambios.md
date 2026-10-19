# Campañas y widgets — cambios

## 2026-10-19 — Efecto y saludo solo en Diseño (Admin)

- **Qué pasaba:** el efecto y el saludo se editaban en dos pantallas (Campañas, con "Guardar", y Diseño › Efecto y saludo,
  con "Publicar"); Diego no sabía dónde guardarlos. "Cuándo se ve el efecto" solo estaba en Campañas.
- **Qué cambió (aprobado por Diego):** cada dato vive en un solo lugar. **Campañas = el cuándo** (activar, fechas, días
  antes/después, solo el día clave o toda la campaña). **Diseño = el cómo** (efecto, saludo, colores…), que se guarda con
  "Publicar". En Campañas se quitaron la grilla de efectos, el campo de saludo y la vista previa del efecto; el efecto
  queda como resumen bajo "Cuándo se ve el efecto" ("Murciélagos · "¡Feliz Halloween!"") y se edita con "Editar cómo se ve →".
- **Archivos (FrontendAdmin):** `pages/campanas/campanas.component.html` y `.ts` (se quitaron `elegirEfecto`, `verEfecto`,
  `borrador`, `efectos`, `urlTienda` y la vista previa).
- **Probado en navegador:** panel de Halloween sin controles de efecto ni vista previa, con el resumen. Sin llaves ni SQL.

## 2026-10-19 — Guardado por campaña en Admin › Campañas (UX)

- **Qué pasaba:** al editar una campaña (p. ej. Halloween → "Toda la campaña") no se veía cómo guardar. "Editar cómo se ve →"
  era un botón azul principal que llevaba a Diseño, y con cambios pendientes el aviso solo ofrecía "Salir sin guardar". El
  "Guardar cambios" estaba en una barra fija abajo, lejos de la campaña, y guardaba todas a la vez. Los interruptores
  parecían inmediatos pero quedaban pendientes.
- **Qué cambió (diseño aprobado por Diego en el chat):**
  - El **interruptor** activar/desactivar se guarda al instante ("Halloween activada"), sin arrastrar los cambios
    pendientes de la campaña abierta. Una campaña propia nueva aún sin guardar se activa con su "Guardar".
  - El **panel** de la campaña tiene su pie: **Guardar** (único botón principal; deshabilitado sin cambios) y **Descartar**
    (con cambios) o **Restablecer lo sugerido** / **Eliminar** (sin cambios). Eliminar una propia pide confirmación y se
    guarda al instante.
  - **Editar cómo se ve →** pasa a enlace secundario a la derecha; con cambios pendientes se reemplaza por "Guarda primero
    para editar cómo se ve".
  - Abrir otra campaña, cambiar de año o crear una propia con cambios pendientes pregunta "¿Descartarlos?".
  - Se quitó la barra fija "Guardar cambios" de abajo. Salir de la página con cambios sigue avisando (guard existente).
- **Archivos (FrontendAdmin):** `pages/campanas/campanas.component.ts` (`guardadas`, `alternar`, `guardar`, `descartar`,
  `eliminar`, `soltarCambios`, `persistir`) y `.html`; `shared/confirm-dialog/` acepta el texto del botón que confirma
  (por defecto sigue "Salir sin guardar").
- **Probado en navegador:** pie con y sin cambios, sin barra de abajo, pregunta al abrir otra campaña (Cancelar mantiene
  la abierta), Descartar vuelve a lo guardado. **Falta probar:** interruptor y Guardar (escriben en la tienda).
- Sin llaves ni SQL.
