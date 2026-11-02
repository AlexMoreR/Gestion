## Reglas de negocio

- `historial_de_registro`: Claude puede leer la bitácora (solo lectura) por código (ORD, OF, COM, SAL, COT o id de un pago o abono) o por día, de lo más viejo a lo más nuevo: hora de Colombia, persona, desde dónde (pantalla, Claude, CRM, script o migración), qué hizo, antes y después (solo lo que cambió) y la tarjeta y commit si los tiene.
- `scripts_firman`: todo script o migración que cambie datos firma con su tarjeta y su commit. Con `--aplicar`, los scripts exigen `--tarjeta T-xxx` y dejan una fila en la bitácora con origen "SCRIPT"; una migración de datos deja su fila con origen "MIGRACION".

## Riesgos de operación

- `historial_muestra_montos`: la bitácora que lee Claude trae montos de antes y después; queda detrás de la misma llave `MCP_API_KEY` de las demás herramientas. Las entradas de antes de oct-2026 no tienen código ni antes/después: salen solo por el texto del resumen.
