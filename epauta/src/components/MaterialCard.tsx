import type { MaterialCardProps } from '@/types'

export const MaterialCard = ({ material, onClick }: MaterialCardProps) => {
  const handleClick = () => {
    if (onClick) {
      onClick(material.publicUrl)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className="bg-gray-100 rounded-lg p-4 cursor-pointer h-full w-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${material.nombre}`}
    >
      <h3 className="text-[15px] uppercase m-0 whitespace-nowrap overflow-hidden text-ellipsis max-w-full font-medium text-gray-800">
        {material.nombre}
      </h3>
    </div>
  )
}

export default MaterialCard
