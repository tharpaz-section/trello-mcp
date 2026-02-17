import type { ApiResponse } from "./types";

const BASE_URL = "https://api.trello.com/1";

export class TrelloService {
  private key: string;
  private token: string;

  constructor(apiKey: string, token: string) {
    this.key = apiKey;
    this.token = token;
  }

  private authParams(): string {
    return `key=${this.key}&token=${this.token}`;
  }

  private async request(method: string, path: string, body?: object): Promise<ApiResponse> {
    try {
      const separator = path.includes("?") ? "&" : "?";
      const url = `${BASE_URL}${path}${separator}${this.authParams()}`;
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);

      const res = await fetch(url, opts);
      const data: any = await res.json();

      if (!res.ok) {
        return { ok: false, error: data?.message || "trello_error", detail: `HTTP ${res.status}` };
      }
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: "trello_error", detail: err.message };
    }
  }

  async getBoards(): Promise<ApiResponse> {
    return this.request("GET", "/members/me/boards?fields=name,url,closed");
  }

  async getLists(boardId: string): Promise<ApiResponse> {
    return this.request("GET", `/boards/${boardId}/lists?fields=name,closed,pos`);
  }

  async getCards(listId: string): Promise<ApiResponse> {
    return this.request("GET", `/lists/${listId}/cards?fields=name,desc,due,dueComplete,labels,idList,url,closed`);
  }

  async getCard(cardId: string): Promise<ApiResponse> {
    return this.request("GET", `/cards/${cardId}?fields=name,desc,due,dueComplete,labels,idList,idBoard,url,closed`);
  }

  async createCard(listId: string, name: string, opts?: { desc?: string; due?: string; idLabels?: string }): Promise<ApiResponse> {
    const params = new URLSearchParams();
    params.set("idList", listId);
    params.set("name", name);
    if (opts?.desc) params.set("desc", opts.desc);
    if (opts?.due) params.set("due", opts.due);
    if (opts?.idLabels) params.set("idLabels", opts.idLabels);
    return this.request("POST", `/cards?${params.toString()}`);
  }

  async updateCard(cardId: string, fields: { name?: string; desc?: string; due?: string; dueComplete?: boolean; closed?: boolean; idList?: string }): Promise<ApiResponse> {
    const params = new URLSearchParams();
    if (fields.name !== undefined) params.set("name", fields.name);
    if (fields.desc !== undefined) params.set("desc", fields.desc);
    if (fields.due !== undefined) params.set("due", fields.due);
    if (fields.dueComplete !== undefined) params.set("dueComplete", String(fields.dueComplete));
    if (fields.closed !== undefined) params.set("closed", String(fields.closed));
    if (fields.idList !== undefined) params.set("idList", fields.idList);
    return this.request("PUT", `/cards/${cardId}?${params.toString()}`);
  }

  async moveCard(cardId: string, listId: string): Promise<ApiResponse> {
    return this.updateCard(cardId, { idList: listId });
  }

  async archiveCard(cardId: string): Promise<ApiResponse> {
    return this.updateCard(cardId, { closed: true });
  }

  async addComment(cardId: string, text: string): Promise<ApiResponse> {
    return this.request("POST", `/cards/${cardId}/actions/comments?text=${encodeURIComponent(text)}`);
  }

  async getLabels(boardId: string): Promise<ApiResponse> {
    return this.request("GET", `/boards/${boardId}/labels?fields=name,color`);
  }

  async addLabel(cardId: string, labelId: string): Promise<ApiResponse> {
    return this.request("POST", `/cards/${cardId}/idLabels?value=${labelId}`);
  }

  async removeLabel(cardId: string, labelId: string): Promise<ApiResponse> {
    return this.request("DELETE", `/cards/${cardId}/idLabels/${labelId}`);
  }
}
