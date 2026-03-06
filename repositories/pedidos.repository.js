import GenericRepository from "./generic.repository.js";

class PedidosRepository extends GenericRepository {
  constructor(model) {
    super(model, "Pedido");
  }
}

export default PedidosRepository;
