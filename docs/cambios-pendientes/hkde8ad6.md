## Pantallas

- `listo_para_despacho_proveedora`: en `/fabricacion/<token>` (enlace de la OF, sin iniciar sesión) la proveedora sube por producto no despachado las fotos del embalaje (foto 1 abierto, foto 2 cerrado con la guía, hasta 3 extra; máximo 5). Se guardan en `EmbalajeFoto` sin despacho con "Proveedora <nombre>" (`markReadyForDispatchAction`). Al despachar con transportadora, el formulario del admin muestra "Fotos del embalaje ya subidas por la proveedora" y no las vuelve a pedir; el despacho las liga.

## Riesgos de operación

- `fotos_embalaje_publicas`: quien tenga el enlace de la OF puede subir hasta 5 fotos por producto no despachado. Las fotos de un producto que nunca se despacha quedan guardadas en el servidor.
