import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { TrelloService } from "./trello";

const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(trello: TrelloService): McpServer {
  const server = new McpServer({
    name: "trello-mcp-server",
    version: "1.0.0",
  });

  server.tool("get_boards", "List all Trello boards", {}, async () => {
    const result = await trello.getBoards();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("get_lists", "Get lists on a board", {
    board_id: z.string().describe("Trello board ID"),
  }, async ({ board_id }) => {
    const result = await trello.getLists(board_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("get_cards", "Get cards on a list", {
    list_id: z.string().describe("Trello list ID"),
  }, async ({ list_id }) => {
    const result = await trello.getCards(list_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("get_card", "Get a single card's details", {
    card_id: z.string().describe("Trello card ID"),
  }, async ({ card_id }) => {
    const result = await trello.getCard(card_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("create_card", "Create a new card on a list", {
    list_id: z.string().describe("List ID to create the card in"),
    name: z.string().describe("Card title"),
    desc: z.string().optional().describe("Card description"),
    due: z.string().optional().describe("Due date (ISO 8601 format)"),
    label_ids: z.string().optional().describe("Comma-separated label IDs"),
  }, async ({ list_id, name, desc, due, label_ids }) => {
    const result = await trello.createCard(list_id, name, {
      desc, due, idLabels: label_ids,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("update_card", "Update a card's fields", {
    card_id: z.string().describe("Card ID to update"),
    name: z.string().optional().describe("New card title"),
    desc: z.string().optional().describe("New description"),
    due: z.string().optional().describe("New due date (ISO 8601)"),
    due_complete: z.boolean().optional().describe("Mark due date as complete"),
    closed: z.boolean().optional().describe("Archive the card"),
  }, async ({ card_id, name, desc, due, due_complete, closed }) => {
    const result = await trello.updateCard(card_id, {
      name, desc, due, dueComplete: due_complete, closed,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("move_card", "Move a card to a different list", {
    card_id: z.string().describe("Card ID to move"),
    list_id: z.string().describe("Target list ID"),
  }, async ({ card_id, list_id }) => {
    const result = await trello.moveCard(card_id, list_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("archive_card", "Archive a card (mark as done)", {
    card_id: z.string().describe("Card ID to archive"),
  }, async ({ card_id }) => {
    const result = await trello.archiveCard(card_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("add_comment", "Add a comment to a card", {
    card_id: z.string().describe("Card ID"),
    text: z.string().describe("Comment text"),
  }, async ({ card_id, text }) => {
    const result = await trello.addComment(card_id, text);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("get_labels", "Get all labels on a board", {
    board_id: z.string().describe("Board ID"),
  }, async ({ board_id }) => {
    const result = await trello.getLabels(board_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("add_label", "Add a label to a card", {
    card_id: z.string().describe("Card ID"),
    label_id: z.string().describe("Label ID to add"),
  }, async ({ card_id, label_id }) => {
    const result = await trello.addLabel(card_id, label_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  server.tool("remove_label", "Remove a label from a card", {
    card_id: z.string().describe("Card ID"),
    label_id: z.string().describe("Label ID to remove"),
  }, async ({ card_id, label_id }) => {
    const result = await trello.removeLabel(card_id, label_id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  return server;
}

export function mountMcp(app: Express, trello: TrelloService, apiKey: string): void {
  const checkAuth = (req: Request, res: Response): boolean => {
    const xApiKey = req.headers["x-api-key"];
    const authHeader = req.headers["authorization"];
    const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const provided = xApiKey || bearer;
    if (provided !== apiKey) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: invalid or missing API key" },
        id: null,
      });
      return false;
    }
    return true;
  };

  app.post("/mcp", async (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        });

        transports.set(newSessionId, transport);
        transport.onclose = () => transports.delete(newSessionId);

        const server = createMcpServer(trello);
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad request: missing session ID or not an init request" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  });
}
