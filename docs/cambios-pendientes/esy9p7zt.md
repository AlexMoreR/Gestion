## Pantallas

- `/admin/balances/cuentas/[accountId]` (Revisión del saldo): recuadro de solo lectura con todo el historial de la cuenta (no depende del mes elegido): punto más bajo y su fecha, saldo inicial que haría falta para no quedar nunca en negativo, primer día en negativo y el registro que la llevó ahí. En cuentas de efectivo lista "Salidas que quizá no salieron de aquí" (número de comprobante o de transacción, foto del comprobante, o nota con transferencia/bancolombia/nequi/bre-b/pse) y cuánto saldo inicial haría falta si esas salidas se pasaran a su banco. No cambia registros ni saldos.

## Riesgos de operación

- `revision_saldo_es_pista`: las "salidas que quizá no salieron de aquí" son una pista: un pago en efectivo con número o foto de recibo también sale marcado. Hay que revisarlas una por una antes de moverlas de cuenta.
