import { useState, useEffect } from "react";
import { ChevronDownIcon, X } from "lucide-react";


interface CollapsibleChatPanelProps {
  notebookId: string;
  ramoNombre: string;
  children: React.ReactNode;
}

export default function CollapsibleChatPanel({
  notebookId,
  ramoNombre,
  children,
}: CollapsibleChatPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true); // Default a true o false

  useEffect(() => {
    // Solo se ejecuta en el cliente (Browser)
    const checkViewport = () => setIsDesktop(window.innerWidth >= 1024);
    checkViewport(); // Revisamos al montar
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  return (
    <div className={`fixed top-20 right-4 w-96 lg:static lg:w-96 lg:h-full z-40 transition-all ${!isOpen ? "lg:w-auto" : ""}`}>
      {/* Chat panel */}
      <div
        className={`
          flex flex-col
          bg-white rounded-lg shadow-lg border border-gray-200
          transition-all duration-300 ease-in-out lg:h-[80vh]
          ${
            isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-95 translate-y-4 pointer-events-none"
          }
        `}
        style={{
          height: isOpen ? (isDesktop ? "80vh" : "auto") : "0",
          overflow: "hidden",
        }}
      >
        {/* Header con botón de cerrar */}
        <div className="flex items-center justify-between p-3 border-b bg-gray-50 rounded-t-lg">
          <h3 className="font-semibold text-sm text-gray-700">
            Chat - {ramoNombre}
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            aria-label="Cerrar chat"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Contenido del chat */}
        <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      </div>

      {/* Botón para abrir cuando está cerrado */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="
            fixed top-20 right-4 w-96
            bg-red-500 hover:bg-red-600
            text-white rounded-lg p-3
            shadow-lg transition-all duration-200
            font-semibold text-sm
          "
          aria-label="Abrir chat"
        >
          💬 Abrir Chat
        </button>
      )}
    </div>
  );
}


interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
}

function Chat({ messages, onSendMessage }: ChatProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
  };

  return (
    <div className="flex-1 flex flex-col p-4">
      <div className="flex-1 overflow-y-auto mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`my-2 p-3 rounded-lg max-w-xs ${
              msg.sender === "user"
                ? "bg-blue-500 text-white ml-auto"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            <ReactMarkdown
              className="prose prose-sm"
              remarkPlugins={[remarkGfm]}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex items-center border-t pt-2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Escribe tu mensaje..."
        />
        <button
          type="submit"
          className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
