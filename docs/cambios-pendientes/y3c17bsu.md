## Entidades

- `ParteColor_recargos_y_comunes`: `ParteColor.recargos` (Json opcional: `{ materiales?: { [material]: pesos }, acabados?: { [acabado]: pesos } }`) y `ParteColor.coloresComunes` (lista de códigos o nombres de la carta que salen primero). El recargo solo se muestra como aviso en la cotización; nunca suma al precio ni a los totales.
- `Quote_colores_aprobados`: `Quote.coloresAprobadosEn` y `Quote.coloresAprobadosPorId` (usuario, SetNull): cuándo y quién marcó "Cliente aprobó colores" al pasar la cotización a venta.

## Pantallas

- `color_por_parte_cotizacion`: en el editor de cotización, un producto (o combo) con partes de color muestra "Color por parte" (un desplegable por parte, "Por definir" válido, aviso de recargo) en vez del color único; en la línea queda guardado `partes` y el color de texto "Tapizado: Crema · Base: Dorada".
- `cliente_aprobo_colores`: casilla obligatoria "Cliente aprobó colores" en "Enviar a ventas" cuando la cotización tiene color por parte.

## Reglas de negocio

- `faltan_colores`: una cotización con productos que tienen partes de color no pasa a venta si alguna parte está en "Por definir" o sin elegir (también las cotizaciones viejas sin partes) ni sin la casilla "Cliente aprobó colores". El servidor lee las partes de la base (un combo usa las del combo por su código). Las ventas directas y las líneas sin partes no cambian (`faltanColores` en `src/lib/product-parts.ts`).

## Riesgos de operación

- `cambiar_color_quita_partes`: "Cambiar color" en una venta con color por parte deja el color nuevo como un solo texto y quita las partes de esa línea.
