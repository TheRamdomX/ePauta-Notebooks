/**
 * Tipos compartidos del dominio de ePAUTA
 *
 * Este archivo centraliza todas las definiciones de tipos utilizadas
 * en la aplicación para asegurar consistencia y type safety.
 */

// ============================================================================
// ENTIDADES PRINCIPALES
// ============================================================================

/**
 * Recurso educativo (archivo almacenado en R2)
 */
export interface Recurso {
  name: string
  id: string
  publicUrl: string
  updated_at: string | null
  created_at: string | null
  codigo?: string
}

/**
 * Ramo/Asignatura
 */
export interface Ramo {
  codigo: string
  nombre: string
}

/**
 * Material de grado (específico de EIT)
 */
export interface MaterialGrado {
  codigo: string
  nombre: string
}

// ============================================================================
// ENUMS Y TIPOS LITERALES
// ============================================================================

/**
 * Carreras académicas disponibles en la plataforma
 */
export type Carrera = 'plan-comun' | 'eit' | 'eoc' | 'eii'

/**
 * Mapeo de carreras a sus nombres completos
 */
export const CARRERA_NAMES: Record<Carrera, string> = {
  'plan-comun': 'Plan Común',
  eit: 'Informática y Telecomunicaciones',
  eoc: 'Obras Civiles',
  eii: 'Industrial',
} as const

/**
 * Extensiones de archivos soportadas
 */
export type FileExtension =
  | 'pdf'
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'ppt'
  | 'pptx'

/**
 * Categorías de tipos de archivo
 */
export type FileCategory = 'pdf' | 'image' | 'office' | 'unsupported'

// ============================================================================
// TIPOS DE STORAGE (R2/S3)
// ============================================================================

/**
 * Objeto de archivo retornado por el storage layer
 */
export interface FileObject {
  name: string
  id: string
  updated_at: string | null
  created_at: string | null
  last_accessed_at: string | null
  metadata: Record<string, unknown> | null
}

/**
 * Opciones para listar archivos del storage
 */
export interface ListOptions {
  limit?: number
  offset?: number
  sortBy?: {
    column: string
    order: 'asc' | 'desc'
  }
}

/**
 * Respuesta del storage layer
 */
export interface StorageResponse<T> {
  data: T | null
  error: Error | unknown | null
}

// ============================================================================
// TIPOS DE FILTRADO Y BÚSQUEDA
// ============================================================================

/**
 * Opciones de filtrado de recursos
 */
export interface FilterOptions {
  search?: string
  sortBy?: 'name' | 'date'
  order?: 'asc' | 'desc'
  fileType?: FileExtension
}

/**
 * Parámetros de búsqueda avanzada
 */
export interface SearchParams {
  query: string
  carrera?: Carrera
  codigo?: string
  fileType?: FileExtension
  page?: number
  perPage?: number
}

// ============================================================================
// TIPOS DE COMPONENTES
// ============================================================================

/**
 * Props para componentes de Card de Material
 */
export interface MaterialCardProps {
  material: {
    nombre: string
    publicUrl: string
  }
  onClick?: (url: string) => void
}

/**
 * Props para el FileViewer
 */
export interface FileViewerProps {
  fileUrl: string
  fileName: string
}

/**
 * Props para ResourcesWithViewer
 */
export interface ResourcesWithViewerProps {
  recursos: Recurso[]
}

/**
 * Props para componentes de Ramo/Card
 */
export interface RamoCardProps {
  nombre: string
  codigo: string
  href: string
  carrera: Carrera
  cantidad?: number
}

// ============================================================================
// TIPOS DE ASTRO PAGES
// ============================================================================

/**
 * Props para páginas dinámicas de carrera/curso
 */
export interface CoursePageProps {
  codigo: string
  nombre: string
  carrera: Carrera
}

/**
 * Params para getStaticPaths
 */
export interface StaticPathParams {
  params: {
    codigo: string
  }
  props: {
    nombre: string
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Verifica si una cadena es una carrera válida
 */
export function isCarrera(value: string): value is Carrera {
  return ['plan-comun', 'eit', 'eoc', 'eii'].includes(value)
}

/**
 * Verifica si una extensión es soportada
 */
export function isValidExtension(ext: string): ext is FileExtension {
  const validExtensions: FileExtension[] = [
    'pdf',
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
  ]
  return validExtensions.includes(ext as FileExtension)
}

/**
 * Determina la categoría de un archivo basado en su extensión
 */
export function getFileCategory(extension: string): FileCategory {
  const ext = extension.toLowerCase()

  if (ext === 'pdf') return 'pdf'

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return 'image'
  }

  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    return 'office'
  }

  return 'unsupported'
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Extrae la extensión de un archivo desde su URL o nombre
 */
export function getFileExtension(fileNameOrUrl: string): string {
  if (!fileNameOrUrl) return ''

  // Remove query parameters
  const urlWithoutParams = fileNameOrUrl.split('?')[0]

  // Extract just the filename (last part after /)
  const fileName = urlWithoutParams.split('/').pop() || ''

  // Split by . to get extension
  const parts = fileName.split('.')

  // If no dots or only one part, no extension found, default to pdf
  if (parts.length === 1) return 'pdf'

  return parts.pop()?.toLowerCase() || ''
}

/**
 * Formatea un nombre de archivo para display
 */
export function formatFileName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')

  return nameWithoutExt.replace(/[-_]/g, ' ').trim()
}

/**
 * Genera una URL amigable para un curso
 */
export function getCourseUrl(carrera: Carrera, codigo: string): string {
  return `/${carrera}/${codigo}`
}

/**
 * Genera una URL de breadcrumb
 */
export function getBreadcrumbUrl(carrera: Carrera): string {
  return `/${carrera}`
}
