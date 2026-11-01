## Entidades

- `PagoProveedoraBorrador`: enlace secreto de un pago a proveedora registrado por Claude para subir la foto del comprobante. Guarda solo el hash del token, el pago (`ledgerEntryId`), `expiraEn` (24 h) y `usadoEn` (un solo uso). Migración `20261029120000_pago_proveedora_mcp`.

## Pantallas

- `/proveedores-pago/soporte/[token]`: página pública (sin sesión) para subir la foto o PDF del comprobante de un pago a proveedora; muestra OF, proveedora, monto y fecha, y dice si el enlace venció o ya se usó.

## Riesgos de operación

- `pago_proveedora_foto_no_revisada`: la foto del comprobante no se revisa; quien tenga el enlace (24 h) puede pegar cualquier imagen una vez. Se puede cambiar desde la cuenta de la proveedora.
