# Sistema de interfaz

Esta guía guarda decisiones de diseño para mantener la aplicación consistente en futuras sesiones.

## Principios

- Usar los componentes existentes tipo shadcn de `src/components/ui` antes de crear controles propios.
- No inventar diseños nuevos si ya existe un patrón en la aplicación.
- Mantener las pantallas administrativas compactas, claras y pensadas para trabajo diario.
- Evitar textos explicativos visibles que no sean necesarios para completar la tarea.
- No usar textos de ejemplo visibles cuando un placeholder directo resuelve mejor el campo.

## Español visible

- Todo texto visible debe ir en español correcto, con tildes y ñ cuando correspondan.
- Usar `año`, nunca `anio`.
- Usar `inválido`, `límite`, `todavía`, `reparación`, `órdenes`, `línea`, `ítem`.
- Revisar mensajes de error, placeholders, botones, labels y textos de ayuda antes de cerrar un cambio.

## Formularios

- En móvil, preferir formularios compactos cuando el usuario necesita registrar datos rápido.
- Mantener fecha y cuenta en la misma fila cuando el ancho lo permita sin romper el texto.
- Cuando se quiten labels visibles para compactar un formulario, mantener `aria-label` en cada campo.
- Las fotos o comprobantes deben ser pequeños y funcionales, no dominar el formulario.
- Usar iconos de `lucide-react` dentro de botones y labels cuando ya se usa ese patrón.
- Los campos de dinero deben usar `MoneyInput` para mantener el formato de pesos.
- Las fechas deben usar `DatePicker` para mantener el mismo comportamiento visual.

## Proveedores

- En abonos a proveedores, mostrar claramente: `Debe`, `Abona` y `Queda`.
- Permitir seleccionar orden o cargo antes de abonar.
- Bloquear visualmente y validar en servidor cuando el abono supera el saldo pendiente.
- Mantener la opción de abono general, pero dejar claro que no está ligado a una orden.

## DIAN

- Los topes o datos de DIAN pertenecen a `Mi negocio`.
- No mostrar información de DIAN en balances salvo que el usuario lo pida explícitamente.
