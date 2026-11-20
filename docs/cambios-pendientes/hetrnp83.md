## Entidades

- `ManufacturingOrder.avisoProveedora*`: `avisoProveedoraEstado` (ENVIANDO / ENVIADO / PRUEBA / ALERTA / FALLIDO; NULL = nunca se mandó), `avisoProveedoraEn` y `avisoProveedoraDestino` (número al que salió). Migración `20261121120000_aviso_of_proveedora`, solo aditiva.

## Reglas de negocio

- `aviso_of_proveedora_whatsapp`: apenas se crea sola la OF del Combo Camillas, en segundo plano (`dispararRecibo`, nunca rompe la venta ni el abono) Gestión le hace POST al CRM (`CRM_OF_WHATSAPP_URL`, por defecto `https://crm.magilus.com/api/gestion/whatsapp-proveedora`, llave Bearer `CRM_API_KEY` → `CATALOGO_API_KEY` → `MCP_API_KEY`, reintentos 2/8/30 s) con `{ linea: 'Admin', telefono, texto, imagenUrl }`. El texto es `mensajeOFProveedora` (`src/lib/manufacturing-orders.ts`): saludo, OF y ORD, piezas con color y cantidad, ciudad de destino, notas, fecha y enlace `/fabricacion/<token>`; nunca nombre, teléfono ni dirección de la clienta ni precios. La foto es la exacta del color. Teléfono con el 57 adelante (`telefonoParaCrm`). Lógica en `src/modules/ventas/application/enviar-of-proveedora.ts`.
- `aviso_of_interruptor`: AppSetting `avisoOFConfig` = `{ "modo": "apagado"|"prueba"|"proveedoras", "numeroPrueba": "573196892277" }`, guardado a mano (sin pantalla). Vacío o roto = «prueba»: todo sale al número del dueño. «apagado» no manda ni marca nada. Se lee en cada envío.
- `aviso_of_candado`: antes de mandar, la OF se marca ENVIANDO solo si `avisoProveedoraEstado` es NULL (`updateMany`): la misma OF nunca sale dos veces. Si `planAvisoOF` da alerta, la OF no sale: al número del dueño le llega el texto del aviso con el código de la OF y queda ALERTA. Cada envío queda en la bitácora (número, hora y resultado). Las OF que ya existían quedan sin estado y no se mandan.

## Riesgos de operación

- `aviso_of_proveedora_real`: pasar `avisoOFConfig` a «proveedoras» le escribe a una proveedora real desde la línea Admin. Solo con el sí de Alexander, después de ver en 573196892277 el mensaje del combo todo negro.
- `aviso_of_ruta_crm`: la ruta del CRM que manda el WhatsApp con foto vive en aizencrm; si no existe, cada aviso queda FALLIDO sin dañar nada.
- `aviso_of_enviando_trabado`: si el servidor se cae entre ENVIANDO y el resultado, la OF queda en ENVIANDO y no se reintenta (mejor no mandarla que mandarla dos veces).
