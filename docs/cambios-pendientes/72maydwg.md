## Pantallas

- `mascaras_de_color`: `/admin/productos/[productId]/mascaras` (solo Admin, enlace «Máscaras de color» en la tarjeta "Partes de color" de la ficha): sobre la foto de portada se pinta con **Pincel** y **Borrador** la zona de cada parte de color y **Guardar máscara** la deja como PNG en blanco y negro en `public/uploads/mascaras/` (`ParteColor.mascaraUrl`). Si el producto usaba las partes de su categoría, al guardar la primera máscara se copian como propias.

## Reglas de negocio

- `vista_previa_color`: `recolorear` (`src/lib/recolor-image.server.ts`) pinta cada parte de la portada con su color (código exacto o la foto de la muestra en mosaico), conservando sombras, y guarda el resultado en `public/uploads/vista-color/<hash>.webp` (si ya existe no lo rehace). Sin máscara o sin color en alguna parte no hay vista previa. Todavía no se muestra en cotizaciones, ventas ni órdenes (parte 4).
- `partes_conservan_mascara`: guardar la tarjeta "Partes de color" conserva la máscara de cada parte que sigue con el mismo nombre.

## Riesgos de operación

- `vista_color_crece`: la carpeta `public/uploads/vista-color` guarda una imagen por cada combinación de colores y no se limpia sola; tampoco se borran las máscaras viejas de `public/uploads/mascaras`.
- `mascara_y_portada`: la máscara vale para la portada del momento; si cambia la portada, hay que volver a pintar las máscaras.
