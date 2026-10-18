# Receta: capacidad nueva de un rubro

Una capacidad es algo que el código compartido pregunta (`perfil().carrito`, `recibeReservas`), nunca `tipoNegocio === '…'`.
Variación por cliente, en este orden: configuración por tienda → capacidad opcional del rubro → `EXCEPCIONES` en el registro del backend.

1. **Backend**: el valor en `modules/negocio/<rubro>/datos.js` de **cada** rubro (el contrato `modules/negocio/contrato.js` obliga);
   léela con `datosDe(tipoNegocio)` o `estrategiaDe(tienda)`. El rubro sale de la BD, nunca del cliente.
2. **Tienda**: el campo en el contrato `src/app/negocio/perfil-negocio.ts` y su valor en el perfil de cada rubro (`negocio/<rubro>/`):
   si falta en uno, no compila.
3. **Admin**: igual en `src/app/negocio/perfil-negocio.ts` y `negocio/<rubro>/perfil.ts`.
4. Actualiza a propósito `negocio/perfiles.spec.ts` en los dos fronts y el test de `modules/negocio/__tests__/`.
5. [Pruebas](pruebas.md) en los tres repos.

**Decide** solo el nombre de la capacidad y su valor por rubro (consúltalo en `docs/rubros/<rubro>.md`).
