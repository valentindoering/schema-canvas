import {
  McpServer,
  fromJsonSchema,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import {
  canvasAgentPolicy,
  canvasProposalGuidance,
  canvasContextMarkdown,
  canvasContextSvg,
  parseCanvasContextQuery,
  parseCanvasProposalInput,
  type CanvasAgentCapabilities,
} from "../../core/index.js";
import {
  canvasContextQuerySchema,
  canvasProposalInputSchema,
  canvasProposalListSchema,
  canvasProposalStatusSchema,
  canvasSearchSchema,
} from "./schemas.js";

export type CanvasAgentToolOptions = {
  reviewUrl?: (proposalId: string) => string;
};

/** Register ONLY read, proposal-submission and own-proposal withdrawal capabilities. Mount transports and auth in the host. */
export function registerCanvasAgentTools(
  server: McpServer,
  agent: CanvasAgentCapabilities,
  options: CanvasAgentToolOptions = {},
) {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  };
  const output = (value: unknown): CallToolResult => ({
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  });
  const guarded =
    (handler: (input: unknown) => Promise<CallToolResult>) =>
    async (input: unknown): Promise<CallToolResult> => {
      try {
        return await handler(input);
      } catch (cause) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: cause instanceof Error ? cause.message : String(cause),
            },
          ],
        };
      }
    };
  server.registerTool(
    "find_canvas_tables",
    {
      description:
        "Find table ids by name before querying a neighborhood. Read-only.",
      inputSchema: fromJsonSchema(canvasSearchSchema),
      annotations,
    },
    guarded(async (input) => {
      const { query, limit } = input as { query: string; limit?: number };
      return output(await agent.findTables(query, limit));
    }),
  );
  server.registerTool(
    "get_canvas_context",
    {
      description: `Read schema documentation and spatial observations around a table (hops), frame, view, selection, or bounds. No scope means the whole document. Hidden relationships are included. Optional PNG matches the returned snapshot. ${canvasAgentPolicy}`,
      inputSchema: fromJsonSchema(canvasContextQuerySchema),
      annotations,
    },
    guarded(async (input) => {
      const query = parseCanvasContextQuery(input);
      const context = await agent.getContext(query);
      const content: CallToolResult["content"] = [
        { type: "text", text: canvasContextMarkdown(context) },
      ];
      if (query.includeImage) {
        const { Resvg } = await import("@resvg/resvg-js");
        const image = new Resvg(canvasContextSvg(context), {
          font: { defaultFontFamily: "sans-serif", loadSystemFonts: true },
        })
          .render()
          .asPng();
        content.push({
          type: "image",
          mimeType: "image/png",
          data: Buffer.from(image).toString("base64"),
        });
      }
      return {
        content,
        structuredContent: context as unknown as Record<string, unknown>,
      };
    }),
  );
  server.registerTool(
    "propose_canvas_change",
    {
      description: `Submit a documentation/layout proposal for human review in the canvas. This writes only to the proposal ledger. It never applies changes to the live documentation. Requires the exact document revision from get_canvas_context. There is no agent approval tool. ${canvasProposalGuidance}`,
      inputSchema: fromJsonSchema(canvasProposalInputSchema),
      annotations: {
        ...annotations,
        readOnlyHint: false,
        idempotentHint: false,
      },
    },
    guarded(async (input) => {
      const proposal = await agent.propose(parseCanvasProposalInput(input));
      let reviewLink: { reviewUrl?: string; warning?: string } = {};
      if (options.reviewUrl) {
        try {
          reviewLink = { reviewUrl: options.reviewUrl(proposal.id) };
        } catch {
          reviewLink = {
            warning:
              "The proposal was saved, but the host could not provide its review URL. Open the canvas to review it.",
          };
        }
      }
      return output({
        proposal,
        ...reviewLink,
        message: "Pending human review. The live documentation is unchanged.",
      });
    }),
  );
  server.registerTool(
    "get_canvas_proposal",
    {
      description:
        "Read proposal status, including whether its base revision is stale. Does not expose approval tokens or grant approval.",
      inputSchema: fromJsonSchema(canvasProposalStatusSchema),
      annotations,
    },
    guarded(async (input) =>
      output(
        await agent.getProposal((input as { proposalId: string }).proposalId),
      ),
    ),
  );
  server.registerTool(
    "list_canvas_proposals",
    {
      description:
        "List your own proposals, newest first, with status, whether each pending one is stale (and which fields conflict), and any `rebaseRequest` from the human reviewer. Redo a stale or rebase-requested proposal on the current text, then withdraw the old one. Read-only.",
      inputSchema: fromJsonSchema(canvasProposalListSchema),
      annotations,
    },
    guarded(async (input) =>
      output({
        proposals: await agent.listProposals(
          (
            input as {
              status?: "pending" | "accepted" | "rejected" | "withdrawn";
            }
          ).status,
        ),
      }),
    ),
  );
  server.registerTool(
    "withdraw_canvas_proposal",
    {
      description:
        "Decline one of YOUR OWN pending proposals, e.g. when manual edits made it obsolete or you want to replace it. It never changes the live documentation and cannot accept anything; only a human accepts.",
      inputSchema: fromJsonSchema(canvasProposalStatusSchema),
      annotations: {
        ...annotations,
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    guarded(async (input) =>
      output({
        proposal: await agent.withdraw(
          (input as { proposalId: string }).proposalId,
        ),
        message: "Withdrawn. The live documentation is unchanged.",
      }),
    ),
  );
  return server;
}

export function createCanvasAgentServer(
  agent: CanvasAgentCapabilities,
  options: CanvasAgentToolOptions = {},
) {
  return registerCanvasAgentTools(
    new McpServer({ name: "schema-canvas", version: "1.0.0" }),
    agent,
    options,
  );
}
