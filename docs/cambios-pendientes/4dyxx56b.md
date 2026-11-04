## Reglas de negocio

- `envio_contraentrega_por_lugar`: en `/admin/transporte` cada ciudad y corregimiento tiene la caja **"Contraentrega $"** (columna `cashOnDeliveryShipping`, pesos). Es el envío del combo de camillas que se paga contraentrega (`isCamillasCombo`, hoy CMB005). Vacío = se cotiza; un corregimiento vacío usa el de su ciudad; en "No llegamos" no aplica. La API `/api/transporte/ubicaciones` lo devuelve como `contraentrega: { envio }` solo cuando se consulta con ese combo; con otro producto o sin producto, `null`. No toca ventas, abonos ni Balances.

## Riesgos de operación

- `envio_contraentrega_mal_cargado`: el valor que se escribe en la caja lo ve la asesora tal cual en el chat del CRM y se lo dice al cliente. Guardarlo no deja anotación en la bitácora.
