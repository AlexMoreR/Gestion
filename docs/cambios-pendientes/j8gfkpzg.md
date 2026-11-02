## Entidades

- `RegistroAnulado`: copia de un abono o gasto anulado (tabla, registro original, código, monto, fila completa, motivo, origen, quién y cuándo). Sin llaves foráneas: queda aunque se borre el resto.

## Reglas de negocio

- `anular_con_motivo`: lo que tiene plata no se borra: se anula con motivo (mínimo 3 letras). "Anular" un abono en Ventas o un gasto en Gastos guarda la copia en `RegistroAnulado`, lo quita y lo anota en la bitácora, todo junto. Al anular un abono la venta vuelve a activa si queda debiendo.

## Pantallas

- `anular_abono_y_gasto`: en Ventas (comprobantes y "Abonos registrados") y en Gastos (Acciones del gasto), el botón ya no dice "Eliminar" sino **Anular** y abre una ventanita con el **Motivo** obligatorio.
