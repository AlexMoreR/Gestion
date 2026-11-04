## Entidades

- `ColorMaterial`: material de la carta de colores digital (Cuerotex, Prana, Corsos = cueros; Telas = tela), con grupo, orden y oculto. La migración `20261106120000_carta_colores` crea solo esos 4 materiales, sin colores.
- `CartaColor`: color de un material de la carta (código, nombre, muestra `#RRGGBB` y foto opcionales, oculto, orden, quién lo creó). Código único por material. Reglas en `src/modules/colores/domain/carta-colores.ts`; todavía sin pantallas (partes 2 y 3).
