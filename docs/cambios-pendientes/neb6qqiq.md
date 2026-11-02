## Reglas de negocio

- `cierre_de_mes`: herramienta MCP `cerrar_mes`: Alexander dicta el saldo real de cada cuenta activa y Gestión crea un movimiento manual de ajuste por cuenta con diferencia (nota "Cierre de mes AAAA-MM: cuadre con el banco", fecha del último día del mes); responde "Cuadró" o "En X faltaban/sobraban N pesos, ya quedó ajustado". Un solo ajuste por cuenta y mes; diferencia de más de $1.000.000 pide confirmación aparte. Lógica en `src/modules/balances/application/close-month.ts`.
- `aviso_cierre_de_mes`: `GET /api/cierre-mes/pendiente` (llave `ALERTAS_API_KEY` o `MCP_API_KEY`, solo lectura) dice si hoy es el último día del mes en Colombia, si el mes ya se cerró, las cuentas y el texto del WhatsApp para Alexander.

## Riesgos de operación

- `cierre_aviso_fuera_de_gestion`: el WhatsApp del último día no lo manda Gestión: hace falta que el CRM o un cron en aizen1 llame a `/api/cierre-mes/pendiente` y lo envíe por la línea Admin. Sin eso, el cierre se hace dictándole los saldos a Claude.
- `cierre_saldo_mal_dictado`: un saldo mal dictado crea un ajuste equivocado; se corrige con un movimiento contrario en Balances (nada se borra).
