## Reglas de negocio

- `foto_llegada_danado`: al reversar una entrega («Entregado ↻» de un producto o «Deshacer entrega» de la orden) con el motivo «Llegó dañado» es obligatoria la «Foto de cómo llegó» (`pideFotoLlegada` en `src/lib/order-item-reversal.ts`); sin ella no se reversa. Se guarda como `EmbalajeFoto` tipo LLEGADA ligada al despacho (una por producto reversado) y la tarjeta «Fotos del embalaje» de la orden la muestra junto a las de salida («Salió así» / «Llegó así»). Solo interna; «Reversar despacho» no pide foto y reversar sigue sin tocar dinero ni estados.
