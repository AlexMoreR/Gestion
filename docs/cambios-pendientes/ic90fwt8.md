## Reglas de negocio

- `color_carta_crm`: el color de un producto en la cotización se escoge de la carta de colores del CRM (una sola carta, la del CRM). Se guarda en las notas del ítem como texto: nombre (`color`), `colorCodigo`, `colorMaterial` y `colorFotoUrl`, para que la cotización no cambie si después editan la carta. Se ve como "CÓDIGO · Nombre (Material)". Los colores escritos a mano (los viejos y los de **Escribir otro color**) se siguen viendo igual. Al pasar a venta, cada pieza de un combo copia el color completo. La OF de la proveedora muestra la foto de la muestra.

## Riesgos de operación

- `carta_colores_crm_caida`: la carta se pide al CRM (`GET /api/gestion/carta-de-colores`, llave `CRM_API_KEY`, luego `CATALOGO_API_KEY`, luego `MCP_API_KEY`) y se guarda 5 minutos en memoria y la última copia buena en `AppSetting.cartaColoresCrm`. Si el CRM no responde o la llave no coincide (401), sale "No se pudo leer la carta del CRM" con la copia guardada o, si no hay, solo el campo a mano. La foto de la muestra en la OF se carga desde el CRM: si está caído no se ve la imagen, pero el código, el nombre y el material siguen.
