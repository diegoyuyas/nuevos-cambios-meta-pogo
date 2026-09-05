# Comparador - Liga Super / Liga Ultra / Liga Master

App responsive (móvil + desktop) para comparar rankings PvP entre dos temporadas, con Filtro Maestro para elegir la liga (Super, Ultra o Master).

## Qué hace
- Filtro Maestro arriba (3 botones): LIGA SUPER (azul), LIGA ULTRA (amarillo), LIGA MASTER (morado), con efecto de "presionado" al seleccionar.
- Detecta caídas de 10, 20, 30, 50+ escalones
- Detecta subidas de 50, 60, 70, 80+ escalones
- Top 50 que mejoraron
- Ficha por Pokémon: ranking antiguo/nuevo, ataques recomendados, otros ataques con * legacy, 5 mejores match y 5 counters solo de temporada actual, stats y gráfico hexagonal tipo PvPoke (sin branding de PvPoke)
- Sección "Movimientos": tablas ordenables (clic en cabecera) de Movimientos Rápidos y Movimientos Cargados, con botón "Ver Pokémon que aprenden" por movimiento (resalta en negrita el movimiento buscado en la ficha de cada Pokémon).

## Estructura
public/data/
  - moves.json, moves_full.json, shadow_icon.json, pokemon_images.json -> comunes a las 3 ligas
  - super/siempre_adelante.json (1145) y super/caminos_crepusculares.json (1144) -> datos reales de Liga Super ya cargados
  - ultra/siempre_adelante.json y ultra/caminos_crepusculares.json -> **vacíos (`[]`)**, reemplázalos con los JSON de Liga Ultra (CP 2500) cuando los tengas
  - master/siempre_adelante.json y master/caminos_crepusculares.json -> **vacíos (`[]`)**, reemplázalos con los JSON de Liga Master (CP 10000) cuando los tengas

Mientras una liga no tenga datos reales, la app muestra un aviso ("Aún no hay datos cargados para esta liga...") en lugar de fallar.

src/ -> React + TypeScript + Vite

## Cómo ejecutarlo

1. Instalar Node.js 18+ desde https://nodejs.org
2. Abrir terminal en la carpeta del proyecto
3. Ejecutar:

```
npm install
npm run dev
```

4. Abrir en navegador: http://localhost:5173
5. En el celular, si estás en la misma WiFi, usa la IP que te muestra Vite, ej: http://192.168.1.10:5173

## Build para producción

```
npm run build
npm run preview
```

Los archivos finales quedan en /dist, los puedes subir a Vercel, Netlify o cualquier hosting.

## Cambiar datos

Si consigues el JSON real de la temporada con counters (el que se baja con F12 -> Network -> rankings-XXXX.json en modo Preview next season), reemplaza el archivo correspondiente dentro de `public/data/<liga>/` (donde `<liga>` es `super`, `ultra` o `master`) y recarga.

Para activar Liga Ultra o Liga Master, simplemente coloca sus dos JSON (formato idéntico al de Liga Super) en `public/data/ultra/` o `public/data/master/` con los mismos nombres de archivo (`siempre_adelante.json` y `caminos_crepusculares.json`).

## Notas

- No muestra que fue descargado de PvPoke. Todo el UI es propio.
- Usa speciesId como clave para comparar.
- Delta = nuevo.rank - antiguo.rank (positivo = cayó, negativo = subió)
- Mejora = antiguo.rank - nuevo.rank
