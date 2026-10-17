-- Términos, promociones y tamaño de la habitación (docs/specs/reserva-hotel-mejoras H4, H5).
-- Solo agrega columnas con valores por defecto: nada cambia hasta que la tienda cargue sus términos.

ALTER TABLE config_reservas
  ADD COLUMN IF NOT EXISTS terminos text;

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS acepta_terminos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acepta_promociones boolean NOT NULL DEFAULT false;

ALTER TABLE hotel_tipos_habitacion
  ADD COLUMN IF NOT EXISTS metros integer;
