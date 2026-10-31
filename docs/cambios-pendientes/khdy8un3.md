## Entidades

- `ProductComponentAlternate`: pieza alterna de un componente de combo (ej. butaco BMV016 o BMV003 en CMB005). Misma cantidad por combo que la pieza principal. Se marca en Productos → combo → "Alternas" debajo de cada pieza. La migración `20261031120000_combo_piezas_alternas` agrega BMV003 como alterna de BMV016 en CMB005.

## Reglas de negocio

- `combo_piezas_alternas`: el stock de cada pieza de un combo es la principal + sus alternas; el stock del combo es el mínimo por pieza (`comboStock` en `src/lib/combo.ts`). Al cotizar por stock o en venta directa, cada pieza se cambia por la primera que tenga existencias para toda la cantidad (principal, luego alternas; `pickComboPieces`). La línea queda con el producto real, así la salida de inventario y el costo son los de la pieza que salió.

## Riesgos de operación

- `combo_alterna_no_mezcla`: si ninguna pieza alcanza sola (ej. 1 BMV016 + 1 BMV003 para 2 combos), queda la principal y la confirmación por stock la frena. Las salidas manuales y compras directas de combos en Inventario siguen usando solo la pieza principal. Si la alterna cuesta distinto, cambia la ganancia y la comisión de esa venta (es el costo real).
