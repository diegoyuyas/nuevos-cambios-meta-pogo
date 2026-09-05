# Comparador Liga Super - Siempre Adelante vs Caminos Crepusculares

App responsive (móvil + desktop) para comparar los 2 JSON que ya tienes.

## Qué hace
- Detecta caídas de 10, 20, 30, 50+ escalones
- Detecta subidas de 50, 60, 70, 80+ escalones
- Top 50 que mejoraron
- Ficha por Pokémon: ranking antiguo/nuevo, ataques recomendados, otros ataques con * legacy, 5 mejores match y 5 counters solo de temporada actual, stats y gráfico hexagonal tipo PvPoke (sin branding de PvPoke)

## Estructura
public/data/
  - siempre_adelante.json (1145) -> tu archivo ranking_liga_super_pvpoke_nueva_temporada.txt convertido
  - caminos_crepusculares.json (1144) -> generado desde tu CSV cp1500_all_overall_rankings.csv + datos del anterior para tener counters

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

Si consigues el JSON real de Twilight Trails con counters (el que se baja con F12 -> Network -> rankings-1500.json en modo Preview next season), reemplaza:

public/data/caminos_crepusculares.json

por ese archivo y recarga.

## Notas

- No muestra que fue descargado de PvPoke. Todo el UI es propio.
- Usa speciesId como clave para comparar.
- Delta = nuevo.rank - antiguo.rank (positivo = cayó, negativo = subió)
- Mejora = antiguo.rank - nuevo.rank
