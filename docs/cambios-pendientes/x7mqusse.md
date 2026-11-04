## Entidades

- `AvisoColorOF`: aviso de cambio de color para la proveedora de una OF (producto, color viejo, color nuevo, quién lo creó, fecha y `vistoEn`). Se crea al guardar "Cambiar color" de un producto que está en una OF; nunca toca dinero ni estados.

## Pantallas

- `aviso_color_of`: en `/admin/ordenes/<id>`, pestaña Fabricación, la tarjeta de la OF muestra en ámbar los cambios de color sin ver y el botón **Avisar cambio de color por WhatsApp** (abre WhatsApp con "Cambio de color en OF-<n>: <producto> pasa de <viejo> a <nuevo>" y el enlace `/of/<código>`); después dice "Visto por la proveedora el <fecha>". En `/fabricacion/<token>` sale arriba "Color cambiado el <fecha>: <producto> <viejo> → <nuevo>" con **Ya lo vi**.

## Qué NO tiene el sistema

- `aviso_color_automatico`: el aviso de cambio de color no se manda solo por WhatsApp; alguien tiene que tocar el botón. Los cambios de color hechos antes de nov-2026 (T-525) no tienen aviso guardado.

## Riesgos de operación

- `ya_lo_vi_sin_clave`: "Ya lo vi" no pide clave: cualquiera con el enlace de la OF puede marcarlo, igual que cualquiera con el enlace puede ver la OF.
