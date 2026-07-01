import type { Product, Provider, Artifact, ChatSummary, ChatMessage, AskAnswerPayload } from "@prox/shared";

export interface ModelInfo { id: string; display_name: string; created_at?: string }
export interface AppSettings { chatModel: string; captionModel: string; effort: string }

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  products: () => fetch("/api/products").then(j<Product[]>),
  providers: () => fetch("/api/providers").then(j<Provider[]>),
  updateProviderKey: (id: string, apiKey: string) =>
    fetch(`/api/providers/${id}`, { method: "PATCH", body: JSON.stringify({ apiKey }) }).then(j<Provider>),
  removeProviderKey: (id: string) =>
    fetch(`/api/providers/${id}`, { method: "PATCH", body: JSON.stringify({ clear: true }) }).then(j<Provider>),
  models: () => fetch("/api/models").then(j<ModelInfo[]>),
  settings: () => fetch("/api/settings").then(j<AppSettings>),
  updateSettings: (b: Partial<AppSettings>) =>
    fetch("/api/settings", { method: "PUT", body: JSON.stringify(b) }).then(j<AppSettings>),
  artifacts: (product: string) => fetch(`/api/artifacts?product=${product}`).then(j<Artifact[]>),
  artifact: (id: string) => fetch(`/api/artifacts/${id}`).then(j<Artifact>),
  chats: (product: string) => fetch(`/api/chats?product=${product}`).then(j<ChatSummary[]>),
  messages: (chat: string) => fetch(`/api/chats?chat=${chat}`).then(j<ChatMessage[]>),
  renameChat: (id: string, title: string) =>
    fetch(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }).then(j),
  deleteChat: (id: string) => fetch(`/api/chats/${id}`, { method: "DELETE" }).then(j),
  page: (product: string, page: number, manual?: string) =>
    fetch(`/api/page?product=${product}&page=${page}${manual ? `&manual=${manual}` : ""}`)
      .then(j<{ url: string; page: number; manualKind: string; manualTitle: string; caption: string | null }>),
  answerAsk: (payload: AskAnswerPayload) =>
    fetch("/api/chat/answer", { method: "POST", body: JSON.stringify(payload) }).then(j),
};
