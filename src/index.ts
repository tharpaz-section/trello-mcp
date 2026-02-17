import express from "express";
import dotenv from "dotenv";
import { requireApiKey } from "./auth";
import { TrelloService } from "./trello";
import { mountMcp } from "./mcp";

dotenv.config();

export function createApp() {
  const app = express();
  app.use(express.json());

  const trelloKey = process.env.TRELLO_API_KEY;
  const trelloToken = process.env.TRELLO_TOKEN;
  const apiKey = process.env.API_KEY;

  if (!trelloKey || !trelloToken || !apiKey) {
    throw new Error("TRELLO_API_KEY, TRELLO_TOKEN, and API_KEY environment variables are required");
  }

  const trello = new TrelloService(trelloKey, trelloToken);
  app.use("/api", requireApiKey(apiKey));

  // Health check (no auth)
  app.get("/health", (_req, res) => {
    res.json({ ok: true, status: "healthy" });
  });

  // REST endpoints
  app.get("/api/boards", async (_req, res) => {
    const result = await trello.getBoards();
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.get("/api/boards/:boardId/lists", async (req, res) => {
    const result = await trello.getLists(req.params.boardId);
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.get("/api/lists/:listId/cards", async (req, res) => {
    const result = await trello.getCards(req.params.listId);
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.get("/api/cards/:cardId", async (req, res) => {
    const result = await trello.getCard(req.params.cardId);
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.post("/api/cards", async (req, res) => {
    const { list_id, name, desc, due, label_ids } = req.body;
    if (!list_id || !name) {
      res.status(400).json({ ok: false, error: "bad_request", detail: "list_id and name are required" });
      return;
    }
    const result = await trello.createCard(list_id, name, { desc, due, idLabels: label_ids });
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.put("/api/cards/:cardId", async (req, res) => {
    const result = await trello.updateCard(req.params.cardId, req.body);
    res.status(result.ok ? 200 : 500).json(result);
  });

  // MCP protocol endpoint
  mountMcp(app, trello, apiKey);

  return app;
}

// Start server when run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const app = createApp();
  app.listen(port, () => {
    console.log(`Trello MCP server listening on port ${port}`);
  });
}
