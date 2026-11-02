## Reglas de negocio

- `aportes_del_dueno_tarjeta`: en Balances → Cuentas, la tarjeta "Aportes del dueño" suma por mes (hora de Colombia) los gastos pagados con la cuenta `OWNER` y muestra el detalle de cada mes. Es una suma de gastos, no un saldo; esos gastos sí cuentan para la ganancia.

## Pantallas

- `/admin/balances`: en la pestaña Cuentas, debajo de la tabla, la tarjeta "Aportes del dueño" con el total de cada mes y sus gastos.

## Riesgos de operación

- `aportes_arriendo_octubre`: `npm run aportes:arriendo -- --aplicar` pasa el arriendo de octubre (gasto `cmvt1s4es005d2ho4x8jr8kle`, $1.000.000) de 1-Bancolombia a "Aportes del dueño": sube el saldo de 1-Bancolombia en $1.000.000. Solo con el sí de Alexander tras comparar el saldo con el extracto; para devolverlo, el ActivityLog guarda la cuenta anterior.
