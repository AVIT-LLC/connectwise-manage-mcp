import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

export function registerProjectTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_search_projects",
    "Search projects in ConnectWise Manage.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/project/projects", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_project",
    "Get a specific project by ID.",
    {
      id: z.number().describe("Project ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/project/projects/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_search_project_tickets",
    "Search tickets under a project. Use projectId to filter by project, or conditions for CW query syntax. Audit/timestamp metadata (creation date, last updated, entered by) lives under the nested _info object, not as top-level fields — e.g. use \"_info/dateEntered > '2024-01-01T00:00:00Z'\" for creation date, NOT 'dateEntered' or 'createdDate'. Use 'fields' to limit response size. For a total count only, use cw_count_project_tickets instead.",
    {
      projectId: z.number().optional().describe("Filter by project ID"),
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by (e.g. 'id desc')"),
      fields: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of ticket fields to return, to reduce response size. 'id' is always included. Supports dot notation for nested object subfields (e.g. 'status/name' instead of the full 'status' object). Common top-level fields: id, summary, recordType, project/name, phase/name, board/name, status/name, priority/name, severity, impact, company/name, company/id, contact/name, site/name, type/name, subType/name, item/name, team/name, owner/identifier, resolutionGoalUTC, closedFlag, closedDate (present when closedFlag=true), closedBy, budgetHours, actualHours, wbsCode. Audit/timestamp metadata lives under the nested _info object instead of top-level: _info/dateEntered (creation date), _info/lastUpdated, _info/enteredBy. Omit 'fields' to return the full ticket object. If unsure which fields exist, call cw_search_project_tickets once without 'fields' first to inspect the full object shape.",
        ),
    },
    async ({ projectId, conditions, page, pageSize, orderBy, fields }) => {
      const conditionParts: string[] = [];
      if (projectId !== undefined) conditionParts.push(`project/id=${projectId}`);
      if (conditions) conditionParts.push(conditions);

      const result = await client.get("/project/tickets", {
        conditions: conditionParts.join(" and ") || undefined,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
        fields,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_count_project_tickets",
    "Count project tickets matching a query, without returning the ticket records themselves. Use this instead of cw_search_project_tickets when the user only wants a total (e.g. 'how many open tickets are on this project?').",
    {
      projectId: z.number().optional().describe("Filter by project ID"),
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
    },
    async ({ projectId, conditions }) => {
      const conditionParts: string[] = [];
      if (projectId !== undefined) conditionParts.push(`project/id=${projectId}`);
      if (conditions) conditionParts.push(conditions);

      const result = await client.get("/project/tickets/count", {
        conditions: conditionParts.join(" and ") || undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_project_ticket",
    "Get a specific project ticket by ID.",
    {
      id: z.number().describe("Project ticket ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/project/tickets/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_project_ticket_notes",
    "Get all notes on a project ticket, including notes from any child tickets.",
    {
      id: z.number().describe("Project ticket ID"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
    },
    async ({ id, page, pageSize }) => {
      try {
        const result = await client.get(`/project/tickets/${id}/allNotes`, {
          page: page ?? 1,
          pageSize: pageSize ?? 25,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404") || msg.includes("405")) {
          // allNotes not supported on this CWM version — fall back to /notes
          const result = await client.get(`/project/tickets/${id}/notes`, {
            page: page ?? 1,
            pageSize: pageSize ?? 25,
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        throw err;
      }
    },
  );

  server.tool(
    "cw_add_project_ticket_note",
    "Add a note to a project ticket. Use internalAnalysisFlag for internal-only notes or resolutionFlag for resolution notes. Defaults to a plain discussion note.",
    {
      id: z.number().describe("Project ticket ID"),
      text: z.string().describe("Note text content"),
      detailDescriptionFlag: z.boolean().optional().describe("Add as detail description (default: false)"),
      internalAnalysisFlag: z.boolean().optional().describe("Mark as internal analysis only (default: false)"),
      resolutionFlag: z.boolean().optional().describe("Mark as resolution note (default: false)"),
    },
    async ({ id, text, detailDescriptionFlag, internalAnalysisFlag, resolutionFlag }) => {
      const body: Record<string, unknown> = { text };
      if (detailDescriptionFlag !== undefined) body.detailDescriptionFlag = detailDescriptionFlag;
      if (internalAnalysisFlag !== undefined) body.internalAnalysisFlag = internalAnalysisFlag;
      if (resolutionFlag !== undefined) body.resolutionFlag = resolutionFlag;

      const result = await client.post(`/project/tickets/${id}/notes`, body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_create_project",
    "Create a new project.",
    {
      name: z.string().describe("Project name"),
      boardId: z.number().describe("Project board ID"),
      companyId: z.number().describe("Company ID"),
      estimatedStart: z.string().optional().describe("Estimated start date (ISO 8601)"),
      estimatedEnd: z.string().optional().describe("Estimated end date (ISO 8601)"),
      description: z.string().optional().describe("Project description"),
      managerId: z.number().optional().describe("Project manager member ID"),
    },
    async ({ name, boardId, companyId, estimatedStart, estimatedEnd, description, managerId }) => {
      const body: Record<string, unknown> = {
        name,
        board: { id: boardId },
        company: { id: companyId },
      };
      if (estimatedStart) body.estimatedStart = estimatedStart;
      if (estimatedEnd) body.estimatedEnd = estimatedEnd;
      if (description) body.description = description;
      if (managerId) body.manager = { id: managerId };

      const result = await client.post("/project/projects", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
