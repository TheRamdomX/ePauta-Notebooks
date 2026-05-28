import { useState } from 'react'
import type { ResourcesWithViewerProps } from '@/types'
import { FileViewer } from './FileViewer'
import { MaterialCard } from './MaterialCard'

// ============================================================================
// Subcomponentes
// ============================================================================

const EmptyState = () => (
  <div className="flex flex-col gap-4 h-[80vh]">
    <div className="flex-1 bg-gray-200 rounded animate-pulse flex items-center justify-center">
      <p className="p-4 m-0 text-black font-normal">Archivo no seleccionado</p>
    </div>
  </div>
)

// ============================================================================
// Componente Principal
// ============================================================================

export const ResourcesWithViewer = ({ recursos }: ResourcesWithViewerProps) => {
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>()
  const [selectedFileName, setSelectedFileName] = useState<string | undefined>()

  const handleResourceClick = (url: string, fileName: string) => {
    setSelectedUrl(url)
    setSelectedFileName(fileName)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[80vh]">
      {/* Panel izquierdo: Lista de recursos */}
      <div className="lg:w-1/3 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {recursos && recursos.length > 0 ? (
            recursos.map((recurso) => (
              <MaterialCard
                key={recurso.id || recurso.name}
                material={{
                  nombre: recurso.name,
                  publicUrl: recurso.publicUrl,
                }}
                onClick={(url) => handleResourceClick(url, recurso.name)}
              />
            ))
          ) : (
            <div className="col-span-full text-center py-8 text-gray-500">
              No hay recursos disponibles
            </div>
          )}
        </div>
      </div>

      {/* Panel central/derecho: Visor de archivos */}
      <div className="lg:flex-1 sticky top-4 self-start">
        {selectedUrl && selectedFileName ? (
          <div className="file-viewer-container h-[80vh]">
            <FileViewer fileUrl={selectedUrl} fileName={selectedFileName} />
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}

export default ResourcesWithViewer
