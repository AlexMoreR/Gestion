## Reglas de negocio

- `ganancia_confiable_asesor`: en el asesor de IA (`ver_venta`, `listar_ventas`) la ganancia de una venta es confiable solo si tiene orden y todos sus productos tienen costo confirmado con la proveedora o de inventario (stock). Si no, la de Balances sale con `confiable: false` y `ver_venta` da una `ganancia_estimada` (total − costos de los productos − flete) con el aviso "Costo aún no confirmado: la ganancia real no se puede dar". Balances, comisiones y nómina no cambian.

## Riesgos de operación

- `links_y_costos_en_mcp`: `ver_venta`, `listar_ventas` y `listar_cotizaciones` entregan links que abren sin contraseña (cotización, venta, orden de fabricación) y `ver_venta`/`listar_ventas` muestran costos: quien tenga la llave del MCP los ve. Compartir cada link solo con el cliente o la proveedora que corresponde.
