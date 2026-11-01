## Reglas de negocio

- `manual_de_pantallas`: `que_es_esta_aplicacion` con `seccion='pantallas'` devuelve `docs/asesor/pantallas.md` (en vivo o desde la foto del build, `manualPantallas`): las 10 tareas del día a día paso a paso y qué hace cada botón de las pantallas que usan. Con `todo` solo indica pedir esa sección.

## Riesgos de operación

- `manual_de_pantallas_desactualizado`: el manual se escribe a mano leyendo el código; si cambia un botón y nadie lo actualiza, Claude dará instrucciones viejas. Por ahora cubre 25 pantallas (la parte 2 agrega las demás).
