import GenericRepository from "./generic.repository.js";

class ZonasEnvioRepository extends GenericRepository {
  constructor(model) {
    super(model, "Zona de envío");
  }
}

export default ZonasEnvioRepository;
