## Reglas de negocio

- `editar_orden_fecha_abonos`: «Editar orden» solo cambia la fecha de la orden (y con ella la de los abonos, el historial y los cargos a la proveedora) si la persona puso otro día (hora Colombia). Si la fecha mueve abonos de día, el cuadro avisa "Esto también cambia la fecha de N abonos (de <mes> a <mes>)" y exige marcar **Sí, cambiar también la fecha de los abonos** (el servidor también). Regla en `src/lib/order-date-edit.ts`.

## Riesgos de operación

- `abonos_movidos_antes`: hasta nov-2026, guardar «Editar orden» sin tocar la fecha ponía a todos los abonos la fecha de la orden y no quedaba en la bitácora. `npm run abonos:revisar-fechas` (solo lectura; con `RESPALDO_DATABASE_URL` lee la fecha original de un respaldo restaurado) lista los posibles casos; corregirlos lo decide el dueño.
