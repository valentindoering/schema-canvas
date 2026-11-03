# Reading the large fictional system with an agent

Open the playground with `?example=large`, or select **Large system** in the
example picker. Its saved edits and proposals use separate storage from the
small example. Reset affects only the selected example.

This seed has 96 tables in eight separated regions, 138 foreign-key relationships,
nested frames, distant region notes, and a few deliberate exceptions to visual
conventions. All names, documentation, and positions are fictional.

## Hands-on exercise

The implementation was exercised through the built CLI's actual MCP stdio
transport. Search resolved table ids, then the following `get_canvas_context`
queries supplied the evidence. The PNG overview and a Cargo region image were
also inspected. This is a developer exercise on an authored fixture, not an
independent or blinded model benchmark. Automated tests check that the evidence
continues to reach the tools; they do not score an AI's reasoning.

- `{ "table": "voyages", "hops": 0 }`: What does cancelling a voyage affect?
  The planning notes say to keep the cancelled voyage, release cargo allocations,
  cancel passage bookings, and preserve identities, scans, and finalized
  manifests. Fare corrections use adjustments; settled receipts remain.
- `{ "table": "cargo_allocations", "hops": 0 }`: Which record is the live cargo
  assignment authority? The distant Cargo notes distinguish live allocations
  from immutable manifest snapshots and stable crate identities.
- `{ "table": "work_orders", "hops": 0 }` followed by
  `{ "table": "outbox_events", "hops": 1 }`: Does a notification failure undo a
  maintenance release? The notes describe an asynchronous `maintenance.released`
  event, Dispatch retries, and idempotent receipts. Delivery failure does not
  revoke the release. The polymorphic event aggregate has no foreign-key arrow
  back to its producer; foreign keys alone miss this handoff.
- `{ "table": "grounding_events", "hops": 0 }`: Who controls grounding?
  Its declared group is Maintenance, while its containing frame is Fleet assets.
  The nearby note explicitly explains this placement. Containment is not ownership.
- `{ "table": "audit_entries", "hops": 0 }`: Does the optional actor link exist?
  Yes. The relationship is returned with its hidden state and reason.
- `{ "frame": "cargo-region", "includeImage": true }`: Read a region without
  calculating coordinates. The structured and written context contains the full
  documentation; the accompanying schematic preserves composition.

## What the exercise changed

Table and view queries now include documentation in their containing frames,
even when notes are distant. Notes inside sibling nested frames stay separate.
Frame membership and actual proximity remain distinct observations. Readable
responses state declared groups separately from spatial containment. Distant
nearest neighbors are no longer called “near.”

The whole-system image shows grouping and connections, but its fine print is too
small to read reliably. Use names and frame ids to narrow the context. Text
preserves the precise rules, field types, and hidden links. Images supplement
that information. Server-side bounds are estimates unless the host supplies
measured geometry. Images embedded in annotations are represented by labels.

These rules describe the fictional system's documented intent. They do not prove
that a host application's runtime code enforces it. An agent should investigate
contradictions rather than infer business rules from distance, color, or arrows.
