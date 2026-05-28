import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RamoChatProps {
  notebookId: string;
  ramoNombre: string;
}

/**
 * Chat panel that lets students ask questions about a course's materials.
 *
 * 1. On mount, creates a chat session via the Astro API proxy.
 * 2. Each message is sent to `/api/chat/ask` which proxies to open-notebook.
 * 3. The response arrives as SSE chunks that are streamed into the UI.
 */
export default function RamoChat({ notebookId, ramoNombre }: RamoChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Create a chat session on mount
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chat/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebookId }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setSessionId(data.sessionId))
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to create chat session:", err);
          setError("No se pudo iniciar el chat. Verifica que el backend esté corriendo.");
        }
      });
    return () => controller.abort();
  }, [notebookId]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          notebookId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(errText || `HTTP ${response.status}`);
      }

      // The response is the full ExecuteChatResponse JSON (not streaming)
      const data = await response.json();
      console.log("Chat response data:", data);

      const aiMessages = (data.messages ?? []) as Array<{
        type: string;
        content: string;
      }>;

      console.log("AI messages:", aiMessages);

      // Find the last AI message
      const lastAi = [...aiMessages].reverse().find((m) => m.type === "ai");
      console.log("Last AI message:", lastAi);

      if (lastAi && lastAi.content) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lastAi.content },
        ]);
      } else {
        console.error("No AI message content found");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No se obtuvo una respuesta válida del servidor." },
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError("Error al obtener respuesta. Intenta de nuevo.");
      // Remove the user message that failed
    } finally {
      setLoading(false);
    }
  }, [input, sessionId, loading, notebookId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div className="flex flex-col h-full bg-white lg:border-none lg:shadow-none min-h-0">
      {/* Header removido localmente si es redundante al de panel cerrado, pero mantenemos para layout si lo piden - Opcionalmente se puede ocultar en este nivel */}
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && !error && (
          <p className="text-center text-gray-400 text-sm mt-8">
            Pregunta lo que necesites sobre los apuntes del ramo
          </p>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 text-sm ${
                msg.role === "user"
                  ? "bg-red-500 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <h1 className="text-lg font-bold mt-2 mb-2" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-base font-bold mt-2 mb-1" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-sm font-bold mt-1 mb-1" {...props} />,
                      p: ({ node, ...props }) => <p className="my-1" {...props} />,
                      ul: ({ node, ...props }) => <ul className="my-1 ml-4 list-disc" {...props} />,
                      ol: ({ node, ...props }) => <ol className="my-1 ml-4 list-decimal" {...props} />,
                      li: ({ node, ...props }) => <li className="my-0" {...props} />,
                      code: ({ node, inline, ...props }) =>
                        inline ? (
                          <code className="text-xs bg-gray-300 px-1 rounded" {...props} />
                        ) : (
                          <code className="text-xs bg-gray-300 px-1 rounded" {...props} />
                        ),
                      pre: ({ node, ...props }) => (
                        <pre className="bg-gray-800 text-white p-2 rounded overflow-x-auto" {...props} />
                      ),
                      blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-gray-400 pl-3 italic" {...props} />
                      ),
                      a: ({ node, ...props }) => <a className="text-blue-600 underline" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-bold" {...props} />,
                      em: ({ node, ...props }) => <em className="italic" {...props} />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 text-sm text-gray-500 animate-pulse">
              Pensando...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            sessionId
              ? "Escribe tu pregunta..."
              : "Conectando al chat..."
          }
          className="flex-1 border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
          disabled={loading || !sessionId}
          aria-label="Mensaje de chat"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !sessionId || !input.trim()}
          className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Enviar mensaje"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
