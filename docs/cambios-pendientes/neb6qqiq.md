## Reglas de negocio

- `cierre_de_mes`: para cerrar el mes, Alexander le dicta a Claude el saldo real de cada cuenta activa (herramienta MCP `cerrar_mes`, dos pasos: resumen y "sí"). Gestión lo compara con su saldo de hoy y, si hay diferencia, crea UN movimiento manual de ajuste por cuenta (entra si faltaba plata, sale si sobraba) con la nota "Cierre de mes AAAA-MM: cuadre con el banco", fechado el último día del mes, y responde en una línea ("Cuadró" o "En X faltaban N pesos, ya quedó ajustado"). Una cuenta ya cerrada ese mes no se vuelve a tocar; diferencias de más de $5.000.000 piden confirmar de nuevo. Solo el mes actual (su último día) o el anterior. Nada se borra: un error se corrige con un movimiento contrario en Balances. Lógica en `src/modules/balances/application/close-month.ts`.
- `aviso_cierre_de_mes`: `GET /api/cierre-mes/pendiente` (solo lectura, llave `ALERTAS_API_KEY` o `MCP_API_KEY`) dice si hoy es el último día del mes en Colombia, qué cuentas activas faltan por cerrar y el texto del WhatsApp para Alexander (`avisar`, `mensaje`). El envío por la línea Admin y el reloj los hace el CRM, no Gestión.

## Riesgos de operación

- `cierre_de_mes_dictado`: un saldo mal dictado crea un ajuste equivocado en esa cuenta (se corrige con un movimiento contrario). El ajuste compara contra el saldo de HOY aunque se cierre el mes anterior: dictar el saldo de hoy, no el del último día.
- `aviso_cierre_de_mes_sin_envio`: si el CRM no consulta `/api/cierre-mes/pendiente` o no manda el WhatsApp, el aviso no llega; el cierre igual se hace dictándole los saldos a Claude.
