## Reglas de negocio

- `cambiar_cuenta_abono`: en Ventas («Ver comprobantes» y «Abonos registrados» de Registrar abono) el botón **Cambiar cuenta** cambia solo la cuenta de un abono (no la retención en la fuente), con motivo obligatorio (mínimo 3 letras); no deja la cuenta OWNER, una inactiva ni la misma. Como el saldo de cada cuenta sale de sumar sus abonos, la cuenta vieja baja y la nueva sube el valor del abono; lo pagado, el estado de la venta, Balances, comisiones y el recibo de caja no cambian. Queda en `ActivityLog` («Cambió la cuenta del abono…», antes/después). Acción `adminChangeSalePaymentAccountAction`; regla `errorCambioCuentaAbono` en `src/lib/sale-payment-account.ts`.

## Riesgos de operación

- `cambiar_cuenta_abono_mes_cerrado`: si el mes del abono ya tiene cierre con el banco (`cerrar_mes`), la ventanita avisa pero deja cambiar: las dos cuentas quedan descuadradas en ese mes y hay que revisar el cuadre. Al día siguiente el revisor diario puede marcar el salto de saldo de esas dos cuentas.
