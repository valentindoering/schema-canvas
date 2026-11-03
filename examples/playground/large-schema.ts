import {
  setSchemaEdgeLayout,
  validateSchemaGraph,
  type CanvasDocument,
  type SchemaAnnotation,
  type SchemaAnnotationColor,
  type SchemaField,
  type SchemaLayout,
  type SchemaTable,
  type SchemaView,
} from "../../src/core/index.js";

type Ref = readonly [name: string, target: string, optional?: boolean];
type Entry = readonly [
  id: string,
  purpose: string,
  refs: readonly Ref[],
  fields: readonly string[],
  immutable?: boolean,
];
type Region = {
  id: string;
  label: string;
  x: number;
  y: number;
  color: SchemaAnnotationColor;
  summary: string;
  boundary: string;
  tables: readonly Entry[];
};

/** Entirely fictional data, authored for scale and architecture-reading exercises. */
export const largeRegions: Region[] = [
  {
    id: "harbor",
    label: "Harbor network",
    x: -3300,
    y: -1400,
    color: "blue",
    summary:
      "# Harbor network\n\nPorts, approach routes, and ground access. Weather reports are immutable observations; alerts describe derived warning windows. A warning is not an observation and never replaces one.",
    boundary:
      "# Conditions at departure\n\nVoyage planning stores a navigation brief referencing the report used at planning time. Reassess current conditions before departure; an old brief is not proof that the weather remains safe.",
    tables: [
      [
        "sky_ports",
        "Stable identity and operating limits of a sky port.",
        [],
        [
          "name:string",
          "regionCode:string",
          "altitude:number",
          "maximumHullLength:number",
          "timezone:string",
          "active:boolean",
        ],
      ],
      [
        "port_regions",
        "Regional operating rules shared by ports.",
        [],
        [
          "code:string",
          "name:string",
          "clearancePolicy:string",
          "seasonStart:datetime",
          "seasonEnd:datetime",
        ],
      ],
      [
        "berths",
        "Physical berths and their hull limits.",
        [["portId", "sky_ports"]],
        [
          "code:string",
          "maximumMass:number",
          "serviceClass:string",
          "available:boolean",
        ],
      ],
      [
        "port_gates",
        "Ground access gates at a port.",
        [["portId", "sky_ports"]],
        [
          "code:string",
          "accessClass:string",
          "opensAt:string",
          "closesAt:string",
        ],
      ],
      [
        "weather_reports",
        "Append-only measured weather, not a mutable current-weather row.",
        [["portId", "sky_ports"]],
        [
          "observedAt:datetime",
          "windSpeed:number",
          "visibility:number",
          "pressure:number",
          "conditions:string",
        ],
        true,
      ],
      [
        "weather_alerts",
        "Derived warnings with an explicit validity interval.",
        [
          ["portId", "sky_ports"],
          ["reportId", "weather_reports"],
        ],
        [
          "level:string",
          "validFrom:datetime",
          "validUntil:datetime",
          "reason:string",
        ],
      ],
      [
        "tide_windows",
        "Permitted mooring windows at tidal ports.",
        [["portId", "sky_ports"]],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "clearance:number",
          "source:string",
        ],
      ],
      [
        "port_notices",
        "Human-authored operational notices.",
        [["portId", "sky_ports"]],
        [
          "title:string",
          "body:string",
          "effectiveFrom:datetime",
          "effectiveUntil:datetime?",
        ],
      ],
      [
        "service_zones",
        "Ground zones belonging to one port.",
        [["portId", "sky_ports"]],
        [
          "code:string",
          "purpose:string",
          "restricted:boolean",
          "capacity:number",
        ],
      ],
      [
        "approach_routes",
        "Approved approach geometry and altitude ranges.",
        [["portId", "sky_ports"]],
        [
          "name:string",
          "minimumAltitude:number",
          "maximumAltitude:number",
          "corridorJson:string",
        ],
      ],
      [
        "mooring_slots",
        "A time reservation for a berth and voyage.",
        [
          ["berthId", "berths"],
          ["voyageId", "voyages"],
        ],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "state:reserved | occupied | released",
        ],
      ],
      [
        "ground_crews",
        "Ground teams assigned to a port zone.",
        [
          ["portId", "sky_ports"],
          ["zoneId", "service_zones"],
        ],
        ["name:string", "callSign:string", "onDuty:boolean", "capacity:number"],
      ],
    ],
  },
  {
    id: "fleet",
    label: "Fleet assets",
    x: -800,
    y: -1900,
    color: "slate",
    summary:
      "# Fleet assets\n\nAirship identity, equipment, ownership, and observed position. Position telemetry does not establish operational availability. Departure eligibility also depends on maintenance releases and crew checks.",
    boundary:
      "# Placement is not ownership\n\nGrounding events are drawn beside Airships so an operator can read the current restriction. Their declared group is Maintenance. Fleet does not own or clear a grounding event. The positions table is a nearby satellite, not a separate subsystem.",
    tables: [
      [
        "airships",
        "Fleet identity; availability is checked against maintenance and crew rules.",
        [
          ["homePortId", "sky_ports"],
          ["classId", "airship_classes"],
        ],
        [
          "name:string",
          "registryCode:string",
          "capacity:number",
          "maximumMass:number",
          "commissionedAt:datetime",
        ],
      ],
      [
        "airship_classes",
        "Hull-class specifications used by individual airships.",
        [],
        [
          "name:string",
          "hullLength:number",
          "ratedRange:number",
          "minimumCrew:number",
        ],
      ],
      [
        "cabins",
        "Named cabin capacity within an airship.",
        [["airshipId", "airships"]],
        [
          "deck:number",
          "name:string",
          "seatCount:number",
          "serviceClass:string",
        ],
      ],
      [
        "engines",
        "Installed propulsion equipment and service counters.",
        [["airshipId", "airships"]],
        [
          "serial:string",
          "model:string",
          "runningHours:number",
          "installedAt:datetime",
        ],
      ],
      [
        "fuel_tanks",
        "Tank capacity and inspected fuel compatibility.",
        [["airshipId", "airships"]],
        [
          "code:string",
          "capacity:number",
          "fuelClass:string",
          "lastCheckedAt:datetime",
        ],
      ],
      [
        "navigation_units",
        "Installed navigation instruments.",
        [["airshipId", "airships"]],
        [
          "serial:string",
          "firmware:string",
          "calibratedAt:datetime",
          "calibrationDue:datetime",
        ],
      ],
      [
        "airship_documents",
        "Validity windows of fleet certificates.",
        [["airshipId", "airships"]],
        [
          "documentKind:string",
          "reference:string",
          "validFrom:datetime",
          "validUntil:datetime",
        ],
      ],
      [
        "airship_ownerships",
        "Historical legal ownership intervals.",
        [
          ["airshipId", "airships"],
          ["accountId", "fare_accounts"],
        ],
        [
          "startsAt:datetime",
          "endsAt:datetime?",
          "share:number",
          "evidence:string",
        ],
      ],
      [
        "equipment_checks",
        "Immutable observations about installed equipment.",
        [
          ["airshipId", "airships"],
          ["checkedById", "crew_members"],
        ],
        [
          "checkedAt:datetime",
          "equipmentCode:string",
          "result:string",
          "notes:string",
        ],
        true,
      ],
      [
        "asset_tags",
        "Searchable tags applied to fleet assets.",
        [["airshipId", "airships"]],
        ["key:string", "value:string", "appliedBy:string"],
      ],
      [
        "hangars",
        "Storage and maintenance capacity at a port.",
        [["portId", "sky_ports"]],
        [
          "code:string",
          "maximumHullLength:number",
          "slotCount:number",
          "serviceClass:string",
        ],
      ],
      [
        "airship_positions",
        "Append-only telemetry; never an availability authority.",
        [["airshipId", "airships"]],
        [
          "observedAt:datetime",
          "latitude:number",
          "longitude:number",
          "altitude:number",
          "source:string",
        ],
        true,
      ],
    ],
  },
  {
    id: "planning",
    label: "Voyage planning",
    x: 2000,
    y: -1000,
    color: "blue",
    summary:
      "# Voyage planning\n\nA voyage references an airship, two ports, and a captain. Stops and route segments describe the plan. A finalized voyage manifest is an immutable departure snapshot, not the live cargo-allocation authority.",
    boundary:
      "# Cancellation is a workflow\n\nKeep the voyage row and record cancelled status. Release cargo_allocations and cancel passage_bookings through their owning groups. Preserve cargo identities, scan history, and finalized manifests. Fare corrections become fare_adjustments; settled receipts are not deleted. These steps are coordinated, not a database cascade.",
    tables: [
      [
        "voyages",
        "The voyage plan and its lifecycle; cancellation preserves the record.",
        [
          ["airshipId", "airships"],
          ["originPortId", "sky_ports"],
          ["destinationPortId", "sky_ports"],
          ["captainId", "crew_members"],
        ],
        [
          "departureAt:datetime",
          "arrivalAt:datetime?",
          "status:planned | ready | underway | complete | cancelled",
          "distanceKm:number",
          "cancellationReason:string?",
        ],
      ],
      [
        "voyage_stops",
        "Ordered planned calls at ports.",
        [
          ["voyageId", "voyages"],
          ["portId", "sky_ports"],
        ],
        [
          "sequence:number",
          "arrivalAt:datetime",
          "departureAt:datetime",
          "purpose:string",
        ],
      ],
      [
        "route_segments",
        "A leg between planned stops.",
        [
          ["voyageId", "voyages"],
          ["fromStopId", "voyage_stops"],
          ["toStopId", "voyage_stops"],
        ],
        ["distanceKm:number", "plannedDuration:number", "corridor:string"],
      ],
      [
        "flight_plans",
        "Versioned submitted flight-plan documents.",
        [["voyageId", "voyages"]],
        [
          "version:number",
          "filedAt:datetime",
          "clearanceCode:string?",
          "planJson:string",
        ],
      ],
      [
        "departure_slots",
        "A scheduled departure reservation.",
        [
          ["voyageId", "voyages"],
          ["portId", "sky_ports"],
        ],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "slotCode:string",
          "confirmed:boolean",
        ],
      ],
      [
        "arrival_slots",
        "A scheduled arrival reservation.",
        [
          ["voyageId", "voyages"],
          ["portId", "sky_ports"],
        ],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "slotCode:string",
          "confirmed:boolean",
        ],
      ],
      [
        "diversion_plans",
        "Preplanned alternate ports for a voyage.",
        [
          ["voyageId", "voyages"],
          ["alternatePortId", "sky_ports"],
        ],
        ["priority:number", "trigger:string", "extraDistance:number"],
      ],
      [
        "voyage_status_events",
        "Append-only voyage lifecycle decisions and their reasons.",
        [["voyageId", "voyages"]],
        [
          "status:string",
          "effectiveAt:datetime",
          "reason:string",
          "actor:string",
        ],
        true,
      ],
      [
        "voyage_constraints",
        "Explicit constraints that must be checked before departure.",
        [["voyageId", "voyages"]],
        [
          "kind:string",
          "rule:string",
          "checkedAt:datetime?",
          "satisfied:boolean",
        ],
      ],
      [
        "navigation_briefs",
        "Weather evidence used at planning time; requires reassessment before departure.",
        [
          ["voyageId", "voyages"],
          ["weatherReportId", "weather_reports"],
        ],
        ["preparedAt:datetime", "validUntil:datetime", "summary:string"],
      ],
      [
        "seasonal_routes",
        "Reusable route templates with an operating season.",
        [
          ["originPortId", "sky_ports"],
          ["destinationPortId", "sky_ports"],
        ],
        [
          "name:string",
          "opensAt:datetime",
          "closesAt:datetime",
          "ratedDistance:number",
        ],
      ],
      [
        "voyage_manifests",
        "Immutable departure snapshots; cargo_allocations owns live assignments.",
        [
          ["voyageId", "voyages"],
          ["allocationId", "cargo_allocations"],
        ],
        [
          "version:number",
          "finalizedAt:datetime",
          "snapshotJson:string",
          "checksum:string",
        ],
        true,
      ],
    ],
  },
  {
    id: "crew",
    label: "Crew operations",
    x: 5000,
    y: -1800,
    color: "emerald",
    summary:
      "# Crew operations\n\nA roster says who is assigned; it does not prove qualification. Check crew_qualifications.validUntil and rest_periods before departure. Training attendance is evidence of attendance, not an active qualification.",
    boundary:
      "# Assignment and eligibility\n\nVoyage crew and duty rosters are planning records. A captain must have a current captain qualification and a valid rest interval. Never infer permission from a name appearing in a roster or from physical proximity of tables.",
    tables: [
      [
        "crew_members",
        "Crew identity; qualifications and rest are separate checks.",
        [],
        [
          "name:string",
          "callSign:string",
          "role:string",
          "homeRegion:string",
          "active:boolean",
        ],
      ],
      [
        "voyage_crew",
        "A planned role assignment on a voyage.",
        [
          ["voyageId", "voyages"],
          ["crewMemberId", "crew_members"],
        ],
        ["station:string", "assignedAt:datetime", "confirmed:boolean"],
      ],
      [
        "qualifications",
        "Qualification definitions, including captain authorization.",
        [],
        ["code:string", "name:string", "scope:string", "renewalMonths:number"],
      ],
      [
        "crew_qualifications",
        "An individual qualification with a real validity interval.",
        [
          ["crewMemberId", "crew_members"],
          ["qualificationId", "qualifications"],
        ],
        [
          "validFrom:datetime",
          "validUntil:datetime",
          "evidence:string",
          "revoked:boolean",
        ],
      ],
      [
        "crew_shifts",
        "Planned duty intervals.",
        [["crewMemberId", "crew_members"]],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "kind:string",
          "confirmed:boolean",
        ],
      ],
      [
        "duty_rosters",
        "Roster publication for a voyage; not an eligibility certificate.",
        [
          ["voyageId", "voyages"],
          ["shiftId", "crew_shifts"],
        ],
        ["publishedAt:datetime", "version:number", "notes:string"],
      ],
      [
        "availability_windows",
        "Declared crew availability intervals.",
        [["crewMemberId", "crew_members"]],
        ["startsAt:datetime", "endsAt:datetime", "preference:string"],
      ],
      [
        "training_sessions",
        "Scheduled training sessions for a qualification.",
        [
          ["qualificationId", "qualifications"],
          ["instructorId", "crew_members"],
        ],
        [
          "startsAt:datetime",
          "location:string",
          "capacity:number",
          "courseVersion:string",
        ],
      ],
      [
        "training_attendance",
        "Attendance evidence, not a qualification grant.",
        [
          ["sessionId", "training_sessions"],
          ["crewMemberId", "crew_members"],
        ],
        ["attendedAt:datetime", "result:string", "notes:string"],
        true,
      ],
      [
        "crew_incidents",
        "Recorded operational incidents involving crew.",
        [
          ["crewMemberId", "crew_members"],
          ["voyageId", "voyages", true],
        ],
        [
          "occurredAt:datetime",
          "category:string",
          "summary:string",
          "reviewedAt:datetime?",
        ],
        true,
      ],
      [
        "relief_assignments",
        "A replacement assignment for a planned crew role.",
        [
          ["originalAssignmentId", "voyage_crew"],
          ["replacementId", "crew_members"],
        ],
        ["effectiveAt:datetime", "reason:string", "approvedBy:string"],
      ],
      [
        "rest_periods",
        "Recorded rest intervals used in departure eligibility.",
        [["crewMemberId", "crew_members"]],
        [
          "startsAt:datetime",
          "endsAt:datetime",
          "verified:boolean",
          "source:string",
        ],
        true,
      ],
    ],
  },
  {
    id: "cargo",
    label: "Cargo logistics",
    x: 2400,
    y: 2400,
    color: "amber",
    summary:
      "# Cargo logistics\n\nCrates and consignments have stable identities independent of voyages. cargo_allocations is the live assignment authority. Voyage manifests are immutable planning snapshots. Allocation can change without deleting a crate.",
    boundary:
      "# Cancelling a voyage\n\nRelease its cargo_allocations. Keep cargo_crates, consignments, cargo_scans, and delivery evidence. A shipment can then be assigned to another voyage. Do not confuse an old finalized manifest with a current allocation.",
    tables: [
      [
        "cargo_crates",
        "A physical handling unit whose identity survives replanning.",
        [["consignmentId", "consignments"]],
        [
          "label:string",
          "weightKg:number",
          "volume:number",
          "fragile:boolean",
          "sealCode:string",
        ],
      ],
      [
        "consignments",
        "A shipper's consignment independent of any one voyage.",
        [
          ["shipperId", "shippers"],
          ["destinationPortId", "sky_ports"],
        ],
        [
          "reference:string",
          "priority:string",
          "declaredValue:number",
          "state:string",
        ],
      ],
      [
        "cargo_items",
        "Declared items inside a consignment.",
        [["consignmentId", "consignments"]],
        [
          "description:string",
          "quantity:number",
          "unitMass:number",
          "classification:string",
        ],
      ],
      [
        "cargo_allocations",
        "The sole live authority assigning crates to voyages.",
        [
          ["cargoCrateId", "cargo_crates"],
          ["voyageId", "voyages"],
        ],
        [
          "allocatedWeight:number",
          "status:reserved | loaded | released",
          "reservedAt:datetime",
          "releasedAt:datetime?",
        ],
      ],
      [
        "loading_jobs",
        "A ground task to load one allocation.",
        [
          ["allocationId", "cargo_allocations"],
          ["groundCrewId", "ground_crews"],
        ],
        ["scheduledAt:datetime", "completedAt:datetime?", "state:string"],
      ],
      [
        "unloading_jobs",
        "A ground task to unload one allocation.",
        [
          ["allocationId", "cargo_allocations"],
          ["groundCrewId", "ground_crews"],
        ],
        ["scheduledAt:datetime", "completedAt:datetime?", "state:string"],
      ],
      [
        "cargo_scans",
        "Append-only custody observations that survive cancellation.",
        [
          ["crateId", "cargo_crates"],
          ["portId", "sky_ports"],
        ],
        [
          "scannedAt:datetime",
          "scanKind:string",
          "operator:string",
          "deviceId:string",
        ],
        true,
      ],
      [
        "storage_lots",
        "Port storage lots for unallocated crates.",
        [["portId", "sky_ports"]],
        [
          "code:string",
          "capacity:number",
          "temperatureClass:string",
          "restricted:boolean",
        ],
      ],
      [
        "customs_declarations",
        "Historical customs evidence for a consignment.",
        [["consignmentId", "consignments"]],
        [
          "reference:string",
          "declaredAt:datetime",
          "jurisdiction:string",
          "documentJson:string",
        ],
        true,
      ],
      [
        "dangerous_goods",
        "Handling constraints for a cargo item.",
        [["cargoItemId", "cargo_items"]],
        [
          "category:string",
          "handlingCode:string",
          "separationRule:string",
          "reviewedAt:datetime",
        ],
      ],
      [
        "delivery_receipts",
        "Append-only evidence of completed delivery.",
        [
          ["consignmentId", "consignments"],
          ["portId", "sky_ports"],
        ],
        [
          "receivedAt:datetime",
          "signedBy:string",
          "condition:string",
          "evidence:string",
        ],
        true,
      ],
      [
        "warehouse_slots",
        "A temporary storage assignment for a crate.",
        [
          ["crateId", "cargo_crates"],
          ["lotId", "storage_lots"],
        ],
        ["slotCode:string", "storedAt:datetime", "releasedAt:datetime?"],
      ],
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    x: -1000,
    y: 2400,
    color: "emerald",
    summary:
      "# Maintenance\n\nWork orders, inspections, and release certificates own maintenance status. A release certificate records authorization to clear a grounding restriction. Its release event is published asynchronously through the dispatch outbox.",
    boundary:
      "# The asynchronous release boundary\n\nIssuing release_certificates produces an outbox_events entry with eventType maintenance.released. aggregateId is a polymorphic string, so there is no foreign-key arrow for this handoff. Dispatch owns retries and idempotent receipts. Notification failure never revokes a maintenance release or reopens its work order.",
    tables: [
      [
        "work_orders",
        "Maintenance work and its decision lifecycle.",
        [
          ["airshipId", "airships"],
          ["servicePortId", "sky_ports"],
          ["leadId", "crew_members", true],
        ],
        [
          "reference:string",
          "state:open | inspected | released",
          "openedAt:datetime",
          "releasedAt:datetime?",
          "summary:string",
        ],
      ],
      [
        "maintenance_tasks",
        "Concrete work required by one work order.",
        [
          ["workOrderId", "work_orders"],
          ["scheduleId", "maintenance_schedules", true],
        ],
        [
          "description:string",
          "sequence:number",
          "completedAt:datetime?",
          "result:string?",
        ],
      ],
      [
        "inspections",
        "An append-only inspection of a work order.",
        [
          ["workOrderId", "work_orders"],
          ["inspectorId", "crew_members"],
        ],
        [
          "inspectedAt:datetime",
          "checklistVersion:string",
          "result:string",
          "notes:string",
        ],
        true,
      ],
      [
        "inspection_findings",
        "Individual findings from an inspection.",
        [["inspectionId", "inspections"]],
        [
          "code:string",
          "description:string",
          "blocking:boolean",
          "resolvedAt:datetime?",
        ],
      ],
      [
        "repair_actions",
        "Historical actions resolving an inspection finding.",
        [
          ["findingId", "inspection_findings"],
          ["performedById", "crew_members"],
        ],
        ["performedAt:datetime", "procedureCode:string", "notes:string"],
        true,
      ],
      [
        "spare_parts",
        "A catalogued spare-part identity.",
        [],
        [
          "partCode:string",
          "description:string",
          "unit:string",
          "requiresTraceability:boolean",
        ],
      ],
      [
        "spare_part_batches",
        "A traceable supplied batch of spare parts.",
        [["partId", "spare_parts"]],
        [
          "batchCode:string",
          "receivedAt:datetime",
          "quantity:number",
          "certificate:string",
        ],
      ],
      [
        "stock_movements",
        "Append-only part consumption and replenishment.",
        [
          ["batchId", "spare_part_batches"],
          ["workOrderId", "work_orders", true],
        ],
        ["occurredAt:datetime", "quantity:number", "reason:string"],
        true,
      ],
      [
        "part_reservations",
        "Parts reserved for a work order before consumption.",
        [
          ["batchId", "spare_part_batches"],
          ["workOrderId", "work_orders"],
        ],
        ["quantity:number", "reservedAt:datetime", "releasedAt:datetime?"],
      ],
      [
        "maintenance_schedules",
        "Recurring maintenance rules for an airship class.",
        [["classId", "airship_classes"]],
        [
          "taskCode:string",
          "intervalHours:number",
          "intervalDays:number",
          "procedureVersion:string",
        ],
      ],
      [
        "grounding_events",
        "Maintenance-owned restrictions displayed near Fleet for operational reading.",
        [
          ["airshipId", "airships"],
          ["workOrderId", "work_orders", true],
        ],
        [
          "effectiveAt:datetime",
          "kind:grounded | cleared",
          "reason:string",
          "actor:string",
        ],
        true,
      ],
      [
        "release_certificates",
        "An immutable maintenance release; delivery failure does not undo it.",
        [
          ["workOrderId", "work_orders"],
          ["airshipId", "airships"],
          ["inspectorId", "crew_members"],
          ["groundingEventId", "grounding_events"],
        ],
        ["releasedAt:datetime", "certificateCode:string", "evidence:string"],
        true,
      ],
    ],
  },
  {
    id: "fares",
    label: "Passage and fares",
    x: -3800,
    y: 2900,
    color: "amber",
    summary:
      "# Passage and fares\n\nBookings link a voyage to a fare account. Charge statements and rows record the agreed charges. Settlement receipts are append-only evidence; corrections are separate fare adjustments.",
    boundary:
      "# Cancellation and recorded charges\n\nCancel the passage_booking, but preserve its statement, rows, and settlement_receipts. Post a fare_adjustment against the relevant charge_row. A booking cancellation is not permission to erase recorded charges or received settlements.",
    tables: [
      [
        "fare_accounts",
        "A party's fare account and settlement preferences.",
        [],
        [
          "name:string",
          "accountCode:string",
          "currency:string",
          "state:string",
          "contactAddress:string",
        ],
      ],
      [
        "shippers",
        "A cargo sender linked to a fare account.",
        [["fareAccountId", "fare_accounts"]],
        [
          "name:string",
          "reference:string",
          "contactAddress:string",
          "active:boolean",
        ],
      ],
      [
        "fare_terms",
        "Versioned commercial terms for a fare account.",
        [["accountId", "fare_accounts"]],
        [
          "version:number",
          "validFrom:datetime",
          "validUntil:datetime?",
          "termsJson:string",
        ],
      ],
      [
        "tariff_books",
        "Versioned reusable fare tariffs.",
        [],
        [
          "name:string",
          "version:number",
          "currency:string",
          "effectiveFrom:datetime",
        ],
      ],
      [
        "tariff_steps",
        "A priced band within one tariff book.",
        [["tariffBookId", "tariff_books"]],
        [
          "minimumDistance:number",
          "maximumDistance:number",
          "serviceClass:string",
          "amountMinor:number",
        ],
      ],
      [
        "fare_estimates",
        "An estimate tied to an account, route, and tariff version.",
        [
          ["accountId", "fare_accounts"],
          ["tariffBookId", "tariff_books"],
        ],
        [
          "reference:string",
          "expiresAt:datetime",
          "totalMinor:number",
          "currency:string",
        ],
      ],
      [
        "passage_bookings",
        "A voyage booking whose cancelled row is retained.",
        [
          ["voyageId", "voyages"],
          ["accountId", "fare_accounts"],
          ["estimateId", "fare_estimates", true],
        ],
        [
          "reference:string",
          "state:booked | cancelled | travelled",
          "bookedAt:datetime",
          "cancelledAt:datetime?",
        ],
      ],
      [
        "booking_seats",
        "A cabin assignment within a passage booking.",
        [
          ["bookingId", "passage_bookings"],
          ["cabinId", "cabins"],
        ],
        ["seatCode:string", "passengerReference:string", "serviceClass:string"],
      ],
      [
        "charge_statements",
        "Recorded charges governed by account terms.",
        [
          ["accountId", "fare_accounts"],
          ["termsId", "fare_terms"],
        ],
        [
          "reference:string",
          "issuedAt:datetime",
          "totalMinor:number",
          "currency:string",
          "state:open | settled | adjusted",
        ],
      ],
      [
        "charge_rows",
        "A charge component linked to its original booking.",
        [
          ["statementId", "charge_statements"],
          ["bookingId", "passage_bookings"],
        ],
        [
          "description:string",
          "quantity:number",
          "amountMinor:number",
          "serviceCode:string",
        ],
      ],
      [
        "settlement_receipts",
        "Append-only evidence of received settlement.",
        [["statementId", "charge_statements"]],
        [
          "receivedAt:datetime",
          "amountMinor:number",
          "currency:string",
          "externalReference:string",
        ],
        true,
      ],
      [
        "fare_adjustments",
        "An append-only correction to a recorded charge row.",
        [["chargeRowId", "charge_rows"]],
        [
          "amountMinor:number",
          "reason:string",
          "recordedBy:string",
          "recordedAt:datetime",
        ],
        true,
      ],
    ],
  },
  {
    id: "dispatch",
    label: "Dispatch and integrations",
    x: 5500,
    y: 2500,
    color: "slate",
    summary:
      "# Dispatch and integrations\n\nDelivery is at least once. outbox_events contains a polymorphic aggregateType/aggregateId and an eventType, so its producers are not fully described by foreign-key arrows. event_receipts supplies consumer idempotency.",
    boundary:
      "# Retry does not reverse a business decision\n\nmaintenance.released is emitted after a release certificate is recorded. A failed webhook or notification is retried here; it never revokes the release. audit_entries may reference a crew member as actor. That long optional arrow is hidden for visual clarity, not removed from the schema.",
    tables: [
      [
        "outbox_events",
        "Durable business events; aggregateId is polymorphic and has no FK target.",
        [],
        [
          "eventType:string",
          "aggregateType:string",
          "aggregateId:string",
          "bodyJson:string",
          "occurredAt:datetime",
          "publishedAt:datetime?",
        ],
        true,
      ],
      [
        "dispatch_runs",
        "A scheduled delivery run, not a voyage's business-state authority.",
        [["voyageId", "voyages", true]],
        [
          "scheduledAt:datetime",
          "state:string",
          "attemptCount:number",
          "purpose:string",
        ],
      ],
      [
        "dispatch_messages",
        "A message generated for an outbox event.",
        [
          ["outboxEventId", "outbox_events"],
          ["runId", "dispatch_runs", true],
        ],
        ["channel:string", "recipient:string", "state:string", "body:string"],
      ],
      [
        "message_attempts",
        "Append-only delivery attempts.",
        [["messageId", "dispatch_messages"]],
        [
          "attemptedAt:datetime",
          "attemptNumber:number",
          "providerCode:string",
          "outcome:string",
          "retryAfter:datetime?",
        ],
        true,
      ],
      [
        "notification_preferences",
        "Account-level choices for delivery channels.",
        [["accountId", "fare_accounts"]],
        [
          "channel:string",
          "eventType:string",
          "enabled:boolean",
          "address:string",
        ],
      ],
      [
        "webhook_endpoints",
        "Configured delivery destinations for an integration account.",
        [["integrationAccountId", "integration_accounts"]],
        [
          "name:string",
          "endpointUrl:string",
          "enabled:boolean",
          "eventPattern:string",
        ],
      ],
      [
        "webhook_deliveries",
        "Delivery status of one event to one endpoint.",
        [
          ["endpointId", "webhook_endpoints"],
          ["outboxEventId", "outbox_events"],
        ],
        [
          "state:string",
          "attemptCount:number",
          "lastAttemptAt:datetime?",
          "deliveredAt:datetime?",
        ],
      ],
      [
        "event_receipts",
        "Append-only idempotency evidence for an event consumer.",
        [
          ["outboxEventId", "outbox_events"],
          ["integrationAccountId", "integration_accounts"],
        ],
        [
          "idempotencyKey:string",
          "processedAt:datetime",
          "handlerVersion:string",
        ],
        true,
      ],
      [
        "integration_accounts",
        "External-system connection identity without embedded credentials.",
        [],
        [
          "provider:string",
          "externalReference:string",
          "state:string",
          "credentialReference:string",
        ],
      ],
      [
        "sync_runs",
        "A scheduled synchronization run for one connection.",
        [["integrationAccountId", "integration_accounts"]],
        [
          "startedAt:datetime",
          "finishedAt:datetime?",
          "cursor:string",
          "state:string",
        ],
      ],
      [
        "reconciliation_cases",
        "A discrepancy discovered by synchronization.",
        [["syncRunId", "sync_runs"]],
        [
          "entityReference:string",
          "kind:string",
          "summary:string",
          "resolvedAt:datetime?",
        ],
      ],
      [
        "audit_entries",
        "Append-only technical activity; optional actor arrow is hidden only for clarity.",
        [["crewMemberId", "crew_members", true]],
        [
          "action:string",
          "entityType:string",
          "entityId:string",
          "recordedAt:datetime",
          "detailsJson:string",
        ],
        true,
      ],
    ],
  },
];

function field(definition: string): SchemaField {
  const colon = definition.indexOf(":");
  const name = definition.slice(0, colon);
  const rawType = definition.slice(colon + 1);
  return {
    name,
    type: rawType.replace(/\?$/, ""),
    optional: rawType.endsWith("?"),
    foreignKeyTargets: [],
  };
}
function label(id: string) {
  return id[0]!.toUpperCase() + id.slice(1).replaceAll("_", " ");
}
const tables: SchemaTable[] = largeRegions.flatMap((region) =>
  region.tables.map(([id, purpose, refs, attributes, immutable]) => {
    const fields: SchemaField[] = [
      {
        name: "id",
        type: `id<${id}>`,
        optional: false,
        primaryKey: true,
        foreignKeyTargets: [],
      },
      ...refs.map(([name, target, optional]) => ({
        name,
        type: `id<${target}>`,
        optional: optional ?? false,
        foreignKeyTargets: [target],
      })),
      ...attributes.map(field),
    ];
    if (!fields.some((f) => f.name === "createdAt" || f.name === "recordedAt"))
      fields.push(
        field(immutable ? "recordedAt:datetime" : "createdAt:datetime"),
      );
    return {
      id,
      label: label(id),
      group: region.label,
      fields,
      metadata: { purpose, immutable: immutable ?? false },
    };
  }),
);
const graph = validateSchemaGraph({
  tables,
  edges: tables.flatMap((table) =>
    table.fields.flatMap((f) =>
      f.foreignKeyTargets.map((target) => ({
        id: `edge-${table.id}.${f.name}.${target}`,
        source: table.id,
        target,
        field: f.name,
        optional: f.optional,
      })),
    ),
  ),
  warnings: [],
});
let layout: SchemaLayout = Object.fromEntries(
  largeRegions.flatMap((region) =>
    region.tables.map(([id, purpose], index) => [
      id,
      {
        x: region.x + 80 + (index % 3) * 440,
        y: region.y + 120 + Math.floor(index / 3) * 380,
        markdown: purpose,
        appearance:
          index === 0 ? "highlighted" : index > 8 ? "quiet" : "standard",
        ...(id === "voyages" || id === "work_orders"
          ? { fieldDisplay: "concise" as const }
          : {}),
      },
    ]),
  ),
);
// A deliberate counterexample to the assumption that spatial containment means ownership.
const fleet = largeRegions.find((r) => r.id === "fleet")!;
layout.grounding_events = {
  ...layout.grounding_events!,
  x: fleet.x + 960,
  y: fleet.y + 1260,
  appearance: "teal",
};
layout.airship_positions = {
  ...layout.airship_positions!,
  x: fleet.x - 420,
  y: fleet.y + 1200,
};
for (const [source, name, settings] of [
  ["release_certificates", "airshipId", { muted: false }],
  ["cargo_items", "consignmentId", { muted: true }],
  ["audit_entries", "crewMemberId", { hidden: true }],
] as const) {
  const edge = graph.edges.find(
    (e) => e.source === source && e.field === name,
  )!;
  layout = setSchemaEdgeLayout(layout, edge, settings);
}
const annotations: SchemaAnnotation[] = largeRegions.flatMap((region) => [
  {
    id: `${region.id}-region`,
    kind: "frame",
    label: region.label,
    x: region.x,
    y: region.y,
    width: 1580,
    height: 2020,
    color: region.color,
  },
  {
    id: `${region.id}-summary`,
    kind: "note",
    markdown: region.summary,
    x: region.x + 80,
    y: region.y + 1700,
    width: 660,
    height: 240,
    color: region.color,
  },
  {
    id: `${region.id}-boundary`,
    kind: "note",
    markdown: region.boundary,
    x: region.x + 820,
    y: region.y + 1700,
    width: 660,
    height: 240,
    color: "slate",
  },
]);
annotations.push(
  {
    id: "cargo-identity-region",
    kind: "frame",
    label: "Stable cargo identities",
    x: 2440,
    y: 2480,
    width: 1400,
    height: 420,
    color: "amber",
  },
  {
    id: "large-reading-guide",
    kind: "note",
    markdown:
      "# Reading this system\n\nRegions separate related work. Labels and notes explain the intended boundaries; geometry alone does not establish ownership. Gray arrows may only be long. One long maintenance dependency is deliberately kept dark. Search for a table or query a region instead of trying to read every label at overview zoom.",
    x: 600,
    y: 1260,
    width: 680,
    height: 320,
    color: "blue",
  },
);
const views: SchemaView[] = [
  {
    id: "all",
    label: "Whole system",
    tableIds: tables.map((t) => t.id),
    edgeIds: graph.edges.map((e) => e.id),
  },
  ...largeRegions.map((region) => {
    const ids = new Set(region.tables.map((t) => t[0]));
    return {
      id: region.id,
      label: region.label,
      tableIds: [...ids],
      edgeIds: graph.edges
        .filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => e.id),
    };
  }),
];
export const largeDocument: CanvasDocument = {
  graph,
  layout,
  annotations,
  views,
};
export function largeSourceFileForTable(tableId: string) {
  const table = tables.find((t) => t.id === tableId);
  const region = largeRegions.find((r) =>
    r.tables.some((t) => t[0] === tableId),
  );
  if (!table || !region) return undefined;
  return {
    path: `schema/${region.id}.ts`,
    source: `// Fictional ${region.label} schema.\n// ${table.metadata?.purpose}\nexport const ${table.id} = table({\n${table.fields.map((f) => `  ${f.name}: ${f.foreignKeyTargets.length ? `reference(${JSON.stringify(f.foreignKeyTargets[0])})` : JSON.stringify(f.type)}${f.optional ? ".optional()" : ""},`).join("\n")}\n});`,
  };
}
