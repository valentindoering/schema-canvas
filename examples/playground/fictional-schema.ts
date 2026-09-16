import type {
  SchemaAnnotation,
  SchemaGraph,
  SchemaLayout,
  SchemaView,
} from "../../src/core/index.js";

const field = (
  name: string,
  type: string,
  options: {
    optional?: boolean;
    primaryKey?: boolean;
    target?: string;
  } = {},
) => ({
  name,
  type,
  optional: options.optional ?? false,
  ...(options.primaryKey ? { primaryKey: true } : {}),
  foreignKeyTargets: options.target ? [options.target] : [],
});

export const graph: SchemaGraph = {
  tables: [
    {
      id: "sky_ports",
      label: "Sky ports",
      group: "Places",
      fields: [
        field("id", "id<sky_ports>", { primaryKey: true }),
        field("name", "string"),
        field("region", "string"),
        field("altitude", "number"),
      ],
    },
    {
      id: "airships",
      label: "Airships",
      group: "Fleet",
      fields: [
        field("id", "id<airships>", { primaryKey: true }),
        field("homePortId", "id<sky_ports>", { target: "sky_ports" }),
        field("name", "string"),
        field("class", "string"),
        field("capacity", "number"),
      ],
    },
    {
      id: "voyages",
      label: "Voyages",
      group: "Fleet",
      fields: [
        field("id", "id<voyages>", { primaryKey: true }),
        field("airshipId", "id<airships>", { target: "airships" }),
        field("originPortId", "id<sky_ports>", { target: "sky_ports" }),
        field("destinationPortId", "id<sky_ports>", {
          target: "sky_ports",
        }),
        field("captainId", "id<crew_members>", { target: "crew_members" }),
        field("departureAt", "datetime"),
        field("arrivalAt", "datetime", { optional: true }),
        field("status", "planned | underway | complete"),
        field("distanceKm", "number"),
        field("notes", "string", { optional: true }),
      ],
    },
    {
      id: "crew_members",
      label: "Crew members",
      group: "Fleet",
      fields: [
        field("id", "id<crew_members>", { primaryKey: true }),
        field("name", "string"),
        field("role", "string"),
        field("certification", "string", { optional: true }),
      ],
    },
    {
      id: "voyage_crew",
      label: "Voyage crew",
      group: "Fleet",
      fields: [
        field("id", "id<voyage_crew>", { primaryKey: true }),
        field("voyageId", "id<voyages>", { target: "voyages" }),
        field("crewMemberId", "id<crew_members>", {
          target: "crew_members",
        }),
        field("station", "string"),
      ],
    },
    {
      id: "cargo_crates",
      label: "Cargo crates",
      group: "Cargo",
      fields: [
        field("id", "id<cargo_crates>", { primaryKey: true }),
        field("voyageId", "id<voyages>", { target: "voyages" }),
        field("label", "string"),
        field("weightKg", "number"),
        field("fragile", "boolean"),
      ],
    },
    {
      id: "weather_reports",
      label: "Weather reports",
      group: "Places",
      fields: [
        field("id", "id<weather_reports>", { primaryKey: true }),
        field("portId", "id<sky_ports>", { target: "sky_ports" }),
        field("observedAt", "datetime"),
        field("windSpeed", "number"),
        field("conditions", "string"),
      ],
    },
  ],
  edges: [
    edge("airships.homePortId", "airships", "sky_ports", "homePortId"),
    edge("voyages.airshipId", "voyages", "airships", "airshipId"),
    edge("voyages.originPortId", "voyages", "sky_ports", "originPortId"),
    edge(
      "voyages.destinationPortId",
      "voyages",
      "sky_ports",
      "destinationPortId",
    ),
    edge("voyages.captainId", "voyages", "crew_members", "captainId"),
    edge("voyage_crew.voyageId", "voyage_crew", "voyages", "voyageId"),
    edge(
      "voyage_crew.crewMemberId",
      "voyage_crew",
      "crew_members",
      "crewMemberId",
    ),
    edge("cargo_crates.voyageId", "cargo_crates", "voyages", "voyageId"),
    edge("weather_reports.portId", "weather_reports", "sky_ports", "portId"),
  ],
  warnings: [],
};

function edge(id: string, source: string, target: string, fieldName: string) {
  return {
    id: `edge-${id}`,
    source,
    target,
    field: fieldName,
    optional: false,
  };
}

export const initialLayout: SchemaLayout = {
  sky_ports: { x: 40, y: 120, appearance: "highlighted" },
  weather_reports: { x: 40, y: 390 },
  airships: { x: 420, y: 150 },
  voyages: {
    x: 800,
    y: 140,
    fieldDisplay: "concise",
    highlightedFields: ["status"],
  },
  crew_members: { x: 420, y: 500 },
  voyage_crew: { x: 800, y: 500, appearance: "quiet" },
  cargo_crates: { x: 1180, y: 210 },
};

export const views: SchemaView[] = [
  {
    id: "all",
    label: "Everything",
    tableIds: graph.tables.map((table) => table.id),
    edgeIds: graph.edges.map((item) => item.id),
  },
  view("fleet", "Fleet", [
    "sky_ports",
    "airships",
    "voyages",
    "crew_members",
    "voyage_crew",
  ]),
  view("cargo", "Cargo", ["sky_ports", "airships", "voyages", "cargo_crates"]),
];

function view(id: string, label: string, tableIds: string[]): SchemaView {
  const included = new Set(tableIds);
  return {
    id,
    label,
    tableIds,
    edgeIds: graph.edges
      .filter((item) => included.has(item.source) && included.has(item.target))
      .map((item) => item.id),
  };
}

export function initialAnnotations(imageUrl: string): SchemaAnnotation[] {
  return [
    {
      id: "fleet-frame",
      kind: "frame",
      label: "Fleet operations",
      x: 360,
      y: 80,
      width: 760,
      height: 720,
      color: "blue",
    },
    {
      id: "model-note",
      kind: "note",
      label: "Reading the model",
      text: "A voyage chooses one airship, two ports, and a captain. Crew assignments and cargo stay separate so each can change without rewriting the voyage.",
      x: 40,
      y: 650,
      width: 300,
      height: 200,
      color: "slate",
    },
    {
      id: "cargo-heading",
      kind: "text",
      label: "Cargo follows the voyage",
      text: "Cargo follows the voyage",
      x: 1160,
      y: 110,
      width: 340,
      height: 72,
      color: "slate",
      fontSize: 26,
    },
    {
      id: "route-card",
      kind: "image",
      label: "Fictional route card",
      asset: "demo/route-card.svg",
      src: imageUrl,
      x: 1180,
      y: 510,
      width: 300,
      height: 180,
      color: "emerald",
    },
  ];
}
