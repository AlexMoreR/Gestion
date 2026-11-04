## Entidades

- `ParteColor.acabadosHex`: color exacto (#RRGGBB) de cada acabado de una parte, `{ "<acabado>": "#RRGGBB" }` (migración `20261112120000_acabados_hex`, solo aditiva). Sin valor se usa el de fábrica (Blanco, Negro, Dorado, Cromado dorado, Cromado/Cromada; `ACABADOS_HEX_DEFECTO` en `src/lib/product-parts.ts`).

## Reglas de negocio

- `imagen_con_colores`: al guardar una cotización, cada línea con partes guarda en sus notas `imagenColoresUrl` (la portada pintada con las máscaras, `src/lib/vista-color.server.ts`); pasa a la orden. Si falta una máscara o un color, o algo falla, queda vacía y la cotización se guarda igual. Se ve en el link y el PDF de la cotización y en la OF de la proveedora; no en el recibo de caja ni en `/proveedores/[token]`. En un combo, las partes y la foto son las del combo.
- `cambiar_color_por_parte`: en una venta pagada, «Cambiar color» de un producto con partes cambia solo las partes elegidas y rehace la imagen en la cotización y la orden; no toca dinero.
- `recolor_ia`: punto de enganche `src/lib/recolor-ia.server.ts` para pintar con IA cuando falta máscara; hoy siempre devuelve nada y no llama a ningún servicio (variable `RECOLOR_IA_KEY`, proveedor y costo por definir con Alexander).

## Riesgos de operación

- `vista_color_mal_pintada`: si una máscara quedó mal hecha, el cliente y la proveedora ven la imagen mal pintada; revisar la vista previa del editor antes de mandar el link.
