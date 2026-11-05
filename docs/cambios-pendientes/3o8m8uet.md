## Reglas de negocio

- `cotizacion_color_obligatorio`: el editor de cotizaciones no deja guardar ("Generar cotizacion" / "Guardar cambios") un combo o un producto con partes de color sin color (vacío o "Por definir"); avisa "Falta escoger el color: CMB005 – Tapizado, …" (`lineasSinColor` en `src/lib/quote-item-meta.ts`, sobre `faltanColores`). Solo se revisa en la pantalla, no en el servidor; también aplica a cotizaciones viejas al editarlas.
- `cotizacion_color_al_cliente`: el enlace público `/cotizaciones/<token>` y su PDF muestran en Descripción el color de cada producto con la miniatura de la muestra del CRM ("CÓDIGO · Nombre (Material)"; a mano, solo el texto; un combo con piezas de colores distintos, uno por pieza). Sin color: "Color por confirmar" (`colores` de `groupQuoteDisplayItems`).

## Riesgos de operación

- `cotizacion_fotos_muestra_crm`: las miniaturas de la muestra se cargan desde el CRM; si el CRM está lento el PDF tarda más y si una foto no carga se ve solo el texto.
