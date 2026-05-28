import { useState } from 'react'
import { Viewer, Worker } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'
import type { FileViewerProps } from '@/types'
import { getFileExtension, getFileCategory } from '@/types'

import '@react-pdf-viewer/full-screen/lib/styles/index.css'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'
import '@react-pdf-viewer/toolbar/lib/styles/index.css'

// Constantes
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const PDF_WORKER_URL = 'https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js'

// ============================================================================
// Subcomponentes
// ============================================================================

interface ToolbarProps {
  fileName: string
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onDownload: () => void
}

const Toolbar = ({
  fileName,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onDownload,
}: ToolbarProps) => (
  <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 gap-2 sticky top-0 z-10">
    <div className="text-sm text-gray-600 font-medium max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap">
      {fileName || 'Archivo'}
    </div>

    <div className="flex gap-1">
      <button
        onClick={onZoomOut}
        className="px-3 py-2 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors text-base font-bold text-gray-700"
        title="Reducir zoom"
        aria-label="Reducir zoom"
      >
        −
      </button>

      <button
        onClick={onResetZoom}
        className="px-3 py-2 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors text-xs text-gray-700 min-w-[3rem]"
        title="Restablecer zoom"
        aria-label="Restablecer zoom"
      >
        {Math.round(zoomLevel * 100)}%
      </button>

      <button
        onClick={onZoomIn}
        className="px-3 py-2 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors text-base font-bold text-gray-700"
        title="Aumentar zoom"
        aria-label="Aumentar zoom"
      >
        +
      </button>

      <div className="w-px bg-gray-200 mx-1" />

      <button
        onClick={onDownload}
        className="px-3 py-2 bg-primary text-white border border-primary rounded hover:bg-primary/90 transition-colors text-base"
        title="Descargar archivo"
        aria-label="Descargar archivo"
      >
        Descargar
      </button>
    </div>
  </div>
)

interface UnsupportedFileViewProps {
  fileName: string
}

const UnsupportedFileView = ({ fileName }: UnsupportedFileViewProps) => (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
    <div className="text-5xl mb-4 text-gray-400">📄</div>
    <h3 className="text-gray-800 mb-2 font-semibold">Vista previa no disponible</h3>
    <p className="text-gray-500 text-sm">
      El archivo <span className="font-medium">{fileName}</span> no puede ser visualizado.
    </p>
    <p className="text-gray-500 text-sm mt-1">Usa el botón de descarga en la barra superior.</p>
  </div>
)

// ============================================================================
// Componente Principal
// ============================================================================

export const FileViewer = ({ fileUrl, fileName }: FileViewerProps) => {
  const defaultLayoutPluginInstance = defaultLayoutPlugin()
  const [zoomLevel, setZoomLevel] = useState(1)

  // Detectar tipo de archivo
  const extension = getFileExtension(fileUrl || fileName)
  const fileCategory = getFileCategory(extension)

  // Handlers de zoom
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  }

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  }

  const handleResetZoom = () => {
    setZoomLevel(1)
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName || 'archivo'
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Renderizar visor de PDF
  const renderPDFViewer = () => (
    <div className="h-[80vh] border border-gray-300">
      <Worker workerUrl={PDF_WORKER_URL}>
        <Viewer fileUrl={fileUrl} plugins={[defaultLayoutPluginInstance]} />
      </Worker>
    </div>
  )

  // Renderizar visor de imágenes
  const renderImageViewer = () => (
    <div className="h-[80vh] border border-gray-300 flex flex-col">
      <Toolbar
        fileName={fileName}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onDownload={handleDownload}
      />
      <div className="flex-1 bg-gray-100 overflow-auto p-4">
        <div className="inline-block min-w-full text-center">
          <img
            src={fileUrl}
            alt={fileName || 'Archivo'}
            className="inline-block max-w-none h-auto transition-all duration-200 align-middle"
            style={{
              width: `calc(100% * ${zoomLevel})`,
            }}
          />
        </div>
      </div>
    </div>
  )

  // Renderizar visor de documentos de Office
  const renderOfficeViewer = () => {
    const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`

    return (
      <div className="h-[80vh] border border-gray-300 flex flex-col">
        <Toolbar
          fileName={fileName}
          zoomLevel={zoomLevel}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onDownload={handleDownload}
        />
        <div
          className="flex-1 overflow-hidden transition-transform duration-200"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left',
            width: `${100 / zoomLevel}%`,
            height: `${100 / zoomLevel}%`,
          }}
        >
          <iframe
            src={viewerUrl}
            className="w-full h-full border-0"
            title={fileName || 'Documento'}
            aria-label={`Visor de ${fileName || 'documento'}`}
          />
        </div>
      </div>
    )
  }

  // Renderizar vista de archivo no soportado
  const renderUnsupportedView = () => (
    <div className="h-[80vh] border border-gray-300 flex flex-col">
      <Toolbar
        fileName={fileName}
        zoomLevel={1}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onDownload={handleDownload}
      />
      <UnsupportedFileView fileName={fileName} />
    </div>
  )

  // Seleccionar el visor apropiado según el tipo de archivo
  switch (fileCategory) {
    case 'pdf':
      return renderPDFViewer()
    case 'image':
      return renderImageViewer()
    case 'office':
      return renderOfficeViewer()
    case 'unsupported':
    default:
      return renderUnsupportedView()
  }
}

export default FileViewer
