## Entidades

- `Dispatch.estimatedDeliveryAt`: fecha y hora estimada de entrega del despacho (momento real en hora de Colombia). Obligatoria al crear un despacho nuevo, en cualquier modalidad; los despachos de antes de nov-2026 quedan sin ella y siguen avanzando.
- `ManufacturingOrder.estimatedDeliveryAt`: fecha y hora estimada en que la proveedora termina la OF (momento real). Distinta de `deliveryDate`, que es solo una fecha escrita y no se toca.
- `ManufacturingOrder.receivedAt`: momento en que se recibió lo fabricado de esa OF.

## Reglas de negocio

- `estado_de_entrega`: `estadoDeEntrega` (`src/lib/delivery-tracking.ts`) compara la fecha estimada con la real y con ahora: entregado a tiempo / tarde, sin fecha, atrasado (gana a "en camino"; «ATRASADO N h» bajo 24 h, si no «N días»), en camino, por vencer (menos de 24 h) o a tiempo. Estas fechas son momentos y no se leen con `colombiaDayKey`.
