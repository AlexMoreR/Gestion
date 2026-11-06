import * as React from "react";
import carreteras from "@/modules/transporte/data/colombia-carreteras.json";

// Línea oscura con borde blanco: se lee igual sobre los cuatro colores de envío.
export const ROAD_STYLES = {
  principales: { color: "#111827", width: 1.5, casing: 2.9 },
  secundarias: { color: "#374151", width: 1, casing: 2 },
  terciarias: { color: "#4b5563", width: 0.7, casing: 1.5 },
} as const;

type RoadLevel = keyof typeof ROAD_STYLES;

const COMMON = {
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

function RoadLines({ paths }: { paths: { d: string; level: RoadLevel }[] }) {
  // Primero todos los bordes y luego las líneas, para que los cruces se vean limpios.
  // Sin clics: el toque sigue llegando al municipio que está debajo.
  return (
    <g pointerEvents="none" aria-hidden="true">
      {paths.map(({ d, level }) => (
        <path key={`b-${level}`} d={d} stroke="white" strokeOpacity={0.85} strokeWidth={ROAD_STYLES[level].casing} {...COMMON} />
      ))}
      {paths.map(({ d, level }) => (
        <path key={`l-${level}`} d={d} stroke={ROAD_STYLES[level].color} strokeWidth={ROAD_STYLES[level].width} {...COMMON} />
      ))}
    </g>
  );
}

const MAJOR: { d: string; level: RoadLevel }[] = [
  { d: carreteras.secundarias, level: "secundarias" },
  { d: carreteras.principales, level: "principales" },
];
const ALL: { d: string; level: RoadLevel }[] = [{ d: carreteras.terciarias, level: "terciarias" }, ...MAJOR];
const ISLAND: { d: string; level: RoadLevel }[] = [{ d: carreteras.recuadroSanAndres.vias, level: "secundarias" }];

// memo: al mover o acercar solo cambia el viewBox; estas líneas no se recalculan.
export const TransporteRoads = React.memo(function TransporteRoads({ showMinor }: { showMinor: boolean }) {
  return <RoadLines paths={showMinor ? ALL : MAJOR} />;
});

export const TransporteIslandRoads = React.memo(function TransporteIslandRoads() {
  return <RoadLines paths={ISLAND} />;
});
