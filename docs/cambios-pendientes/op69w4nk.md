## Reglas de negocio

- `ganancia_balances_sin_retiros`: en `/admin/balances`, la tarjeta Ganancias = ventas − costos − (gastos − retiros del dueño); los retiros del dueño son pagos de Nómina a quien tiene la ficha `isOwner` en Equipo. La tarjeta Gastos muestra "Nómina pagada: $X · Retiros del dueño: $Y". Misma cifra que `listar_gastos`.

## Riesgos de operación

- `cierre_e_informe_restan_retiros`: el cierre de mes (`src/lib/month-closure.ts`) y `/informe` siguen restando todos los gastos, incluidos los retiros del dueño; su ganancia de un mes con retiros sale más baja que la de Balances hasta que el dueño decida si se cambian.
