/**
 * Typed HTTP client for the open-notebook REST API.
 *
 * All calls go through `apiFetch` which adds JSON headers, validates
 * the response status, and deserialises the body.  Streaming endpoints
 * return the raw `Response` so the caller can consume the ReadableStream.
 */

const API_BASE =
  import.meta.env.OPEN_NOTEBOOK_API_URL ?? "http://localhost:5055/api";

// ─── Response types (match open-notebook Pydantic models) ─────────

export interface Notebook {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  created: string;
  updated: string;
  source_count: number;
  note_count: number;
}

export interface Source {
  id: string;
  title: string;
  source_type?: string;
  url?: string;
  status?: string;
  asset_type?: string;
  original_filename?: string;
  asset?: {
    url?: string;
    file_path?: string;
  };
}

export interface Note {
  id: string;
  title?: string;
  content: string;
  note_type: string;
}

export interface ChatSessionResponse {
  id: string;
  title: string;
  notebook_id?: string;
  created: string;
  updated: string;
  message_count?: number;
  model_override?: string;
}

export interface ChatMessage {
  id: string;
  type: "human" | "ai" | string;
  content: string;
  timestamp?: string;
}

export interface ExecuteChatResponse {
  session_id: string;
  messages: ChatMessage[];
}

export interface SearchResult {
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  search_type: string;
}

export interface AskResponse {
  answer: string;
  question: string;
}

// ─── Error class ──────────────────────────────────────────────────

export class OpenNotebookApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenNotebookApiError";
  }
}

// ─── Generic fetcher ──────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenNotebookApiError(res.status, body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Notebooks ────────────────────────────────────────────────────

export async function listNotebooks(): Promise<Notebook[]> {
  return apiFetch<Notebook[]>("/notebooks");
}

export async function getNotebook(id: string): Promise<Notebook> {
  return apiFetch<Notebook>(`/notebooks/${encodeURIComponent(id)}`);
}

// ─── Sources ──────────────────────────────────────────────────────

export async function listSourcesByNotebook(
  notebookId: string,
): Promise<Source[]> {
  // The open-notebook API returns sources linked to a notebook via
  // the context endpoint or via a direct query. We use the search endpoint
  // filtered by notebook, but we can also query sources directly.
  // For now, use the repo query approach via the sources list endpoint.
  return apiFetch<Source[]>(
    `/sources?notebook_id=${encodeURIComponent(notebookId)}`,
  );
}

export async function getSource(sourceId: string): Promise<Source> {
  return apiFetch<Source>(`/sources/${encodeURIComponent(sourceId)}`);
}

export function getSourceDownloadUrl(sourceId: string): string {
  return `${API_BASE}/sources/${encodeURIComponent(sourceId)}/download`;
}

// ─── Chat ─────────────────────────────────────────────────────────

export async function createChatSession(
  notebookId: string,
  title?: string,
): Promise<ChatSessionResponse> {
  return apiFetch<ChatSessionResponse>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({
      notebook_id: notebookId,
      title: title ?? undefined,
    }),
  });
}

export async function getChatSession(
  sessionId: string,
): Promise<ChatSessionResponse> {
  return apiFetch<ChatSessionResponse>(
    `/chat/sessions/${encodeURIComponent(sessionId)}`,
  );
}

/**
 * Execute a chat turn. This is NOT streaming — it sends a message and
 * returns the full response with all messages.
 *
 * The context dict tells the backend which sources/notes are "in context"
 * for this conversation. Pass an empty context to let the LLM decide.
 */
export async function executeChat(
  sessionId: string,
  message: string,
  context: Record<string, unknown> = { sources: {}, notes: {} },
  modelOverride?: string,
): Promise<ExecuteChatResponse> {
  return apiFetch<ExecuteChatResponse>("/chat/execute", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      message,
      context,
      model_override: modelOverride ?? null,
    }),
  });
}

// ─── Search ───────────────────────────────────────────────────────

export async function searchKnowledgeBase(
  query: string,
  type: "text" | "vector" = "text",
  limit = 100,
): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify({ query, type, limit }),
  });
}

/**
 * Ask the knowledge base a question (non-streaming).
 * Requires strategy, answer, and final_answer model IDs.
 */
export async function askKnowledgeBase(
  question: string,
  strategyModel: string,
  answerModel: string,
  finalAnswerModel: string,
): Promise<AskResponse> {
  return apiFetch<AskResponse>("/search/ask/simple", {
    method: "POST",
    body: JSON.stringify({
      question,
      strategy_model: strategyModel,
      answer_model: answerModel,
      final_answer_model: finalAnswerModel,
    }),
  });
}

/**
 * Ask the knowledge base a question (SSE streaming).
 * Returns the raw Response so the caller can consume the stream.
 */
export async function askKnowledgeBaseStream(
  question: string,
  strategyModel: string,
  answerModel: string,
  finalAnswerModel: string,
): Promise<Response> {
  return fetch(`${API_BASE}/search/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      strategy_model: strategyModel,
      answer_model: answerModel,
      final_answer_model: finalAnswerModel,
    }),
  });
}
