## Reglas de negocio

- `inicio_en_cache`: el inicio de magilus.com sale de caché (ISR, se rehace cada 5 min). `src/proxy.ts` sirve "/" desde la ruta interna `/inicio/portada` (`src/app/(storefront)/inicio/[clave]/page.tsx`; el build no la arma porque no tiene base, igual que las fichas) y manda `/?q=`, `/?page=` y `/?category=` con 308 a `/catalogo` con los mismos parámetros (el buscador del menú ya va a `/catalogo?q=`; `?category=<id>` lo resuelve `/catalogo` a `/<slug>`). Los `utm`/`fbclid` de los anuncios se quedan en el inicio.

## Riesgos de operación

- `ruta_inicio_reservada`: `/inicio` y `/inicio/...` redirigen a "/" (para que Google no vea dos inicios): ninguna categoría puede tener el slug `inicio`.
