# Incidentes de despliegue

Un incidente por bloque, el más nuevo arriba: qué pasó, por qué, cómo se arregló y qué cuidar.

## 23-nov-2026 — T-875 «Editar compra con descuento/recargo» no llegó a producción

- **Qué pasó:** a las 5:56 p. m. se subió a `main` el commit `c42a47675f`. GitHub Actions falló, la imagen nueva
  nunca se construyó y el Coordinador lo deshizo solo con `78913af`. Producción siguió con la versión anterior.
- **Por qué:** no fue un error de arranque. Falló el paso `npm run test:db` (prueba con base real) en
  `tests/db/caminos-con-plata.db.test.ts` › «5c. editar una compra con pagos»: T-875 volvió obligatorio el
  «Motivo del cambio» al editar una compra y la prueba seguía llamando `adminUpdateDirectPurchaseAction` sin
  `motivo`, así que la acción respondía «Escribe el motivo del cambio (mínimo 3 letras)».
- **Arreglo:** la prueba 5c manda `motivo` (commit `99ec0d1` en la rama
  `tablero/6b7cu3kd-editar-compra-diseno-limpio-costo-editab`); se trajo `main` y se re-aplicó T-875 deshaciendo
  la reversa. Antes de subir: `npx tsc --noEmit`, `npm test` (1460), `npm run test:db` (56, Postgres local),
  `npm run build` y la app arrancada con `npm run start` abriendo `/admin/ordenes` con sesión de admin.
  Subido a `main` en `703f279`; GitHub Actions en verde y producción arriba con el build de las 6:56 p. m.
  (foto del build de `que_es_esta_aplicacion`).
- **Qué cuidar:** quien construye una tarjeta debe correr también `npm run test:db` (con un Postgres
  desechable), no solo `npm test`: las pruebas de base solo corren en GitHub y ahí frenan el despliegue.
