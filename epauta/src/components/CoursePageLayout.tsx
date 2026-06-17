import { useState } from "react";
import { MessageCircle, X, Plus, ChevronRight } from "lucide-react";
import ResourcesWithViewer from "./ResourcesWithViewer";
import RamoChat from "./RamoChat";
import type { Recurso } from "@/types";

interface Props {
  recursos: Recurso[];
  notebookId: string;
  ramoNombre: string;
}

export default function CoursePageLayout({ recursos, notebookId, ramoNombre }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  function handleNewChat() {
    try {
      sessionStorage.removeItem(`epauta_chat_session_${notebookId}`);
      sessionStorage.removeItem(`epauta_chat_messages_${notebookId}`);
    } catch {}
    setResetKey((k) => k + 1);
  }

  return (
    <div className="flex gap-4 mt-8 min-h-[80vh]">
      {/* Visor de recursos — siempre flex-1, el flex layout se ajusta solo */}
      <div className="flex-1 min-w-0">
        <ResourcesWithViewer recursos={recursos} />
      </div>

      {/* Panel de chat — siempre montado, se muestra/oculta con ancho */}
      <div
        className="shrink-0 transition-all duration-300 overflow-hidden sticky top-4 self-start"
        style={{
          width: chatOpen ? "380px" : "0px",
          opacity: chatOpen ? 1 : 0,
          pointerEvents: chatOpen ? "auto" : "none",
        }}
      >
        <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden h-[80vh] w-[380px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-red-500 text-white shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-sm truncate max-w-[220px]">{ramoNombre}</span>
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
                onClick={() => setChatOpen(false)}
                className="p-1 hover:bg-red-600 rounded-lg transition-colors"
                aria-label="Cerrar chat"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Contenido del chat */}
          <div key={resetKey} className="flex-1 overflow-hidden flex flex-col min-h-0">
            <RamoChat notebookId={notebookId} ramoNombre={ramoNombre} />
          </div>
        </div>
      </div>

      {/* Botón flotante para abrir el chat */}
      <button
        onClick={() => setChatOpen((v) => !v)}
        className={`
          fixed bottom-4 right-4 z-50
          flex items-center gap-2
          bg-red-500 hover:bg-red-600 active:bg-red-700
          text-white px-4 py-3 rounded-full
          shadow-lg hover:shadow-xl
          transition-all duration-200
          font-semibold text-sm
        `}
        aria-label={chatOpen ? "Cerrar chat" : "Abrir chat IA"}
      >
        <MessageCircle className="w-5 h-5" />
        {!chatOpen && <span>Chat IA</span>}
        {chatOpen && <X className="w-4 h-4" />}
      </button>
    </div>
  );
}
