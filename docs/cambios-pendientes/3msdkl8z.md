## Entidades

- `EmbalajeFoto`: foto del embalaje de un producto de la orden (`orderItemId`), de tipo ABIERTO (paquete abierto), CERRADO (paquete cerrado con la guía), EXTRA o LLEGADA. `dispatchId` queda NULL mientras la foto no se usa en un despacho; guarda quién la subió (`subidoPorUserId` y `subidoPorTexto`). Migración `20261104130000_embalaje_fotos`, solo aditiva.

## Reglas de negocio

- `fotos_embalaje_obligatorias`: un despacho con transportadora (orden de venta o de compra) no se crea si cada producto no tiene al menos una foto ABIERTO y una CERRADO (las del formulario más las guardadas sin despacho); máximo 5 por producto sin contar LLEGADA. En el despacho en lote las mismas fotos sirven para todos los productos (una fila por producto). "Recoge en bodega" no las pide. Regla pura en `src/lib/embalaje-fotos.ts` (`validarFotosEmbalaje`).

## Riesgos de operación

- `fotos_embalaje_frenan_despacho`: si la regla falla o el celular no sube la foto, no se puede despachar con transportadora. Fotos de más de 12 MB o en formato raro se rechazan con su mensaje y se reintenta. Si algo falla después de guardar las fotos en disco, quedan archivos sueltos (igual que la foto de la guía).
