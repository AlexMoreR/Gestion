## Módulos

- `colores`: Carta de colores (cueros y telas) en `/admin/colores`: el equipo agrega, edita y oculta colores por material (Cuerotex, Prana, Corsos, Telas). Nada se borra. Un empleado lo puede tener si el dueño se lo da. Acciones en `src/app/actions/colores-actions.ts`; bitácora con tipo `COLOR`.

## Pantallas

- `/admin/colores`: una sección por material con tarjetas de color (muestra, "Prana 03 · Palo rosa", Visible/Oculto) y los botones Agregar color, Editar, Ocultar/Mostrar y Ocultar material/Mostrar material. Las fotos van a `public/uploads/colores/` (`saveColorSwatchPhoto`).
