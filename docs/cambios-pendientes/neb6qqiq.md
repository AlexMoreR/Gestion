## Reglas de negocio

- `corte_de_mes_colombia`: desde nov-2026 el mes termina a medianoche de Colombia (antes, 7 p. m.). Un pago o una entrega del último día después de las 7 p. m. cuenta en ese mes en Balances, informe, comisiones, nómina y origen de ventas. Las fechas escritas a mano (gasto, abono, movimiento) no se corren. Los meses anteriores no cambian.
- `cierre_de_mes`: herramienta MCP `cerrar_mes`. El dueño dicta el saldo real de cada cuenta activa y Gestión crea un movimiento de ajuste por cuenta si no cuadra (nota "Cierre de mes AAAA-MM: cuadre con el banco", último día del mes). Responde "Cuadró" o "En X faltaban/sobraban N pesos, ya quedó ajustado". Dos pasos, sin duplicar por cuenta y mes, tope de $5.000.000 que pide confirmación aparte.

## Riesgos de operación

- `cierre_aviso_whatsapp`: Gestión no envía WhatsApp. El aviso del último día depende de que el CRM lea `GET /api/cierre-mes/pendiente` (llave `CIERRE_MES_API_KEY`, si no `CATALOGO_API_KEY`, si no `MCP_API_KEY`) y le escriba a Alexander por la línea Admin.
- `cierre_saldo_mal_dictado`: un saldo mal dictado crea un ajuste equivocado; se corrige con un movimiento contrario en Balances (no se borra nada).
