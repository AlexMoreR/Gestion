## Reglas de negocio

- `corte_de_dia_y_mes`: el día y el mes se cortan a medianoche de Colombia en todo el sistema (Balances, comisiones, nómina, portal de la asesora, retroactivos, asistencia, equipo, Marketplace y cuenta de proveedoras). Una fecha escrita por una persona cuenta en el día escrito; una hora real se lee en hora de Colombia.

## Riesgos de operación

- `cierres_de_mes_viejos`: los cierres de mes (`MonthClosure`) guardados antes de este cambio no se recalculan y pueden no cuadrar con Balances en las ventas pagadas entre las 7 p. m. y la medianoche del último día del mes.
