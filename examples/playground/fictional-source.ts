export type FictionalSourceFile = {
  path: string;
  description: string;
  tableIds: string[];
  source: string;
};

export const fictionalSourceFiles: FictionalSourceFile[] = [
  {
    path: "schema/places.ts",
    description: "Defines ports and their weather observations.",
    tableIds: ["sky_ports", "weather_reports"],
    source: `export const placeTables = {
  sky_ports: table({
    name: field.string(),
    region: field.string(),
    altitude: field.number(),
  }),

  weather_reports: table({
    portId: field.reference("sky_ports"),
    observedAt: field.datetime(),
    windSpeed: field.number(),
    conditions: field.string(),
  }),
};`,
  },
  {
    path: "schema/fleet.ts",
    description: "Defines the fleet and the work of each voyage.",
    tableIds: ["airships", "voyages", "crew_members", "voyage_crew"],
    source: `export const fleetTables = {
  airships: table({
    homePortId: field.reference("sky_ports"),
    name: field.string(),
    class: field.string(),
    capacity: field.number(),
  }),

  voyages: table({
    airshipId: field.reference("airships"),
    originPortId: field.reference("sky_ports"),
    destinationPortId: field.reference("sky_ports"),
    captainId: field.reference("crew_members"),
    departureAt: field.datetime(),
    arrivalAt: field.optional(field.datetime()),
    status: field.enum("planned", "underway", "complete"),
  }),

  crew_members: table({
    name: field.string(),
    role: field.string(),
    certification: field.optional(field.string()),
  }),

  voyage_crew: table({
    voyageId: field.reference("voyages"),
    crewMemberId: field.reference("crew_members"),
    station: field.string(),
  }),
};`,
  },
  {
    path: "schema/cargo.ts",
    description: "Keeps cargo attached to its scheduled voyage.",
    tableIds: ["cargo_crates"],
    source: `export const cargoTables = {
  cargo_crates: table({
    voyageId: field.reference("voyages"),
    label: field.string(),
    weightKg: field.number(),
    fragile: field.boolean(),
  }),
};`,
  },
];

export function sourceFileForTable(tableId: string) {
  return fictionalSourceFiles.find((file) => file.tableIds.includes(tableId));
}
