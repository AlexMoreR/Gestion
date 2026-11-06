## Pantallas

- `fechas_de_entrega_orden`: en `/admin/ordenes/<id>`, tarjeta "Fechas de entrega": por cada despacho no cancelado, chip de estado, fecha real, campo de fecha y hora estimada con **Guardar fecha** e historial de quién y cuándo la cambió (bitácora `ActivityLog` con el resumen "Cambió la fecha estimada…", sin tabla nueva).
- `fechas_de_la_of`: en la pestaña Fabricación, cada OF pide "Fecha y hora estimada de entrega" (obligatoria al guardar), deja corregir la "Fecha real (recibido)", tiene **Marcar recibido** e "Historial de fechas". Sin estimada, **Copiar enlace** y **Enviar por WhatsApp** salen apagados con "Falta la fecha estimada".

## Reglas de negocio

- `of_recibida_al_despachar`: al crear un despacho, cada OF sin fecha real cuya proveedora ya tiene todos sus productos en despachos no cancelados ni devueltos queda recibida en ese momento (`ofTodaDespachada` + `marcarOfRecibidasSiDespachadas` en `src/lib/manufacturing-orders.ts`; bitácora a nombre de "Automático (al despachar)"). Las fotos de embalaje de la proveedora no cuentan.
- `deliveryDate_de_la_of`: al guardar la OF, `deliveryDate` se llena con el día de la fecha estimada escrita, para que `/fabricacion/<token>` y `/of/<código>` muestren la misma fecha.

## Qué NO tiene el sistema

- `recibido_no_se_deshace`: deshacer un despacho no borra la fecha real de la OF; se corrige a mano en la pestaña Fabricación. Una OF que no existía al despachar tampoco recibe la fecha real sola.
