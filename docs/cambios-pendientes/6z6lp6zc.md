## Modelo de datos

- `ParteColor.acabadosHex`: color exacto (#RRGGBB) de cada acabado de una parte tipo Acabados, `{ "<acabado>": "#RRGGBB" }` (migración `20261112120000_acabados_hex`, solo aditiva). Sin valor se usa el de fábrica (`ACABADOS_HEX_DEFECTO` en `src/lib/product-parts.ts`: Blanco, Negro, Dorado, Cromado dorado, Cromado; también en femenino).

## Reglas de negocio

- `imagen_con_colores`: al guardar una cotización, cada línea con partes de color guarda en sus notas `imagenColoresUrl` (foto de portada pintada con las máscaras, `src/lib/vista-color.server.ts`, único lugar que la genera). Un combo se pinta con el combo. Si falta portada, máscara o color, queda vacía y la cotización se guarda igual. La orden la copia; el link del cliente, el PDF y `/fabricacion` la muestran con el texto por parte debajo ("Sin vista previa de color" si no hay). El color de un acabado sale siempre de la base, nunca del navegador.
- `cambiar_color_por_parte`: «Cambiar color» en una venta con partes cambia solo las partes elegidas (por nombre) y rehace la imagen en la cotización y la orden; sin tocar dinero ni avisar a nadie. Un color de texto quita las partes y la imagen vieja.

## Lo que no tiene

- `recolor_ia`: la IA de respaldo (`src/lib/recolor-ia.server.ts`) es solo un punto de enganche: devuelve null y no llama a ningún servicio, aun con `RECOLOR_IA_KEY` (proveedor y costo por definir con Alexander).
- `vista_color_vieja`: las cotizaciones guardadas antes no tienen imagen hasta que se vuelvan a guardar.

## Riesgos de operación

- `vista_color_mascara`: si una máscara quedó mal hecha, el cliente y la proveedora ven la imagen mal pintada (sale en el link, el PDF y la OF).
