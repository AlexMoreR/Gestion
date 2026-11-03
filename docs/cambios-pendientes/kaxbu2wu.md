## Entidades

- `OrderNote`: notas internas del equipo sobre una orden (texto, quién la escribió y cuándo). Se borran con la orden; mientras un usuario tenga notas no se puede borrar ese usuario (como con el historial de estados).

## Pantallas

- `/admin/ordenes/[orderId]`: tarjeta "Notas" con "Agregar nota" (máximo 1.000 letras) y "Borrar" en las notas propias; de la más nueva a la más vieja, con nombre y fecha y hora de Colombia.
- `/admin/ordenes`: ícono de nota en las órdenes con notas (al pasar el mouse o tocarlo, la última nota); el buscador "Buscar orden, venta, cliente o nota" también busca en el texto de las notas.
