-- Precios con o sin impuestos (docs/specs/reserva-hotel-mejoras H2).
-- Solo agrega columnas con valores por defecto: las tiendas siguen como hoy
-- (precios con impuestos incluidos y sin recargo por servicio).

ALTER TABLE config_reservas
  ADD COLUMN IF NOT EXISTS precios_con_impuestos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recargo_servicio_pct integer NOT NULL DEFAULT 0;

ALTER TABLE config_reservas
  DROP CONSTRAINT IF EXISTS config_reservas_recargo_servicio_pct_check;
ALTER TABLE config_reservas
  ADD CONSTRAINT config_reservas_recargo_servicio_pct_check CHECK (recargo_servicio_pct BETWEEN 0 AND 13);

-- Copia del modo y del desglose al reservar (H2.6).
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS impuestos jsonb;
