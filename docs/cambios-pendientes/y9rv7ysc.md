## Entidades

- `ComboFotoColor`: foto real de cada variante de color del combo camilla (CMB005 / CAV-16). Una fila por producto y `claveColor` (única); guarda `etiqueta` (texto para mostrar, ej. "Tapizado: Negro · Estructura: Blanca"), `fotoUrl` (en `public/uploads/combo-colores`, reducida a 1600 px en JPG), `actualizadoPorId` (sin llave foránea) y `updatedAt`. Se borra con el producto. Migración `20261120120000_combo_foto_color`, solo aditiva.

## Pantallas

- `/admin/productos/[productId]/fotos-color`: fotos por color del combo camilla (solo Admin con permiso de Productos; enlace «Fotos por color» en la ficha del combo). Lista las piezas del combo y una fila por variante con su foto y los botones «Cambiar foto» y «Quitar»; «Agregar variante» elige los colores por parte (o un solo color) y «Subir foto» la guarda. Cada cambio queda en la bitácora del producto. No crea OF ni manda nada.

## Reglas de negocio

- `clave_color_combo`: `claveColorCombo` (`src/lib/combo-foto-color.ts`) arma la clave de la variante con el color de cada parte, sin tildes, en minúsculas y con las partes en orden alfabético (`estructura=blanca|tapizado=negro`), o con el color único (`color=palo de rosa`). No hay clave si alguna parte está en «Por definir» o vacía, o si las piezas del mismo combo traen colores distintos.
- `foto_exacta_del_color`: `fotoExactaDelColor` devuelve la foto solo si la clave coincide exacta; si no, nada. Nunca una foto parecida ni la de otro color ("todo negro" no toma la de "negro con estructura blanca").

## Riesgos de operación

- `fotos_color_por_nombre`: la clave usa los nombres de las partes y de los colores. Si se renombra una parte o un color en la carta del CRM, esa variante queda sin foto (nunca con una equivocada) hasta subirla otra vez con el nombre nuevo.
