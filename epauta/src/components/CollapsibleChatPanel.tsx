import { useState } from "react";
import { X, MessageCircle, ChevronDown, Plus } from "lucide-react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  function handleNewChat() {
    try {
      sessionStorage.removeItem(`epauta_chat_session_${notebookId}`);
      sessionStorage.removeItem(`epauta_chat_messages_${notebookId}`);
    } catch {}
    setResetKey((k) => k + 1);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Panel flotante — siempre montado, solo se oculta visualmente */}
      <div
        className="
          flex flex-col
          w-[360px] sm:w-[400px]
          bg-white rounded-2xl shadow-2xl border border-gray-200
          overflow-hidden
          transition-all duration-300 ease-in-out
          origin-bottom-right
        "
        style={{
          height: isOpen ? "520px" : "0px",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          marginBottom: isOpen ? undefined : "0px",
        }}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-red-500 text-white shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            <span className="font-semibold text-sm truncate max-w-[240px]">
              {ramoNombre}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewChat}
              className="p-1 hover:bg-red-600 rounded-lg transition-colors"
              aria-label="Nuevo chat"
              title="Nuevo chat"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-red-600 rounded-lg transition-colors"
              aria-label="Minimizar chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido del chat — siempre renderizado para no perder estado */}
        <div key={resetKey} className="flex-1 overflow-hidden flex flex-col min-h-0">
          {children}
        </div>
      </div>

      {/* Botón flotante toggle */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="
          flex items-center gap-2
          bg-red-500 hover:bg-red-600 active:bg-red-700
          text-white
          px-4 py-3 rounded-full
          shadow-lg hover:shadow-xl
          transition-all duration-200
          font-semibold text-sm
        "
        aria-label={isOpen ? "Minimizar chat" : "Abrir chat IA"}
      >
        <MessageCircle className="w-5 h-5" />
        {!isOpen && <span>Chat IA</span>}
        {isOpen && <X className="w-4 h-4" />}
      </button>
    </div>
  );
}
