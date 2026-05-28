import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MaterialCard } from '../MaterialCard'

describe('MaterialCard', () => {
  const mockMaterial = {
    nombre: 'Test Document.pdf',
    publicUrl: 'https://example.com/test.pdf',
  }

  it('renders material name correctly', () => {
    render(<MaterialCard material={mockMaterial} />)

    expect(screen.getByText('Test Document.pdf')).toBeInTheDocument()
  })

  it('calls onClick with correct URL when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<MaterialCard material={mockMaterial} onClick={handleClick} />)

    const card = screen.getByRole('button')
    await user.click(card)

    expect(handleClick).toHaveBeenCalledWith(mockMaterial.publicUrl)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Enter key is pressed', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<MaterialCard material={mockMaterial} onClick={handleClick} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard('{Enter}')

    expect(handleClick).toHaveBeenCalledWith(mockMaterial.publicUrl)
  })

  it('calls onClick when Space key is pressed', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<MaterialCard material={mockMaterial} onClick={handleClick} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard(' ')

    expect(handleClick).toHaveBeenCalledWith(mockMaterial.publicUrl)
  })

  it('has correct accessibility attributes', () => {
    render(<MaterialCard material={mockMaterial} />)

    const card = screen.getByRole('button')
    expect(card).toHaveAttribute('tabIndex', '0')
    expect(card).toHaveAttribute('aria-label', 'Abrir Test Document.pdf')
  })

  it('does not call onClick if not provided', async () => {
    const user = userEvent.setup()

    render(<MaterialCard material={mockMaterial} />)

    const card = screen.getByRole('button')

    // Should not throw error
    await user.click(card)
    expect(card).toBeInTheDocument()
  })

  it('truncates long file names with ellipsis', () => {
    const longNameMaterial = {
      nombre: 'Very Long File Name That Should Be Truncated With Ellipsis.pdf',
      publicUrl: 'https://example.com/long.pdf',
    }

    render(<MaterialCard material={longNameMaterial} />)

    const text = screen.getByText(longNameMaterial.nombre)
    const computedStyle = window.getComputedStyle(text)

    expect(text).toBeInTheDocument()
    // Verificar que tiene las clases de truncamiento
    expect(text.className).toContain('overflow-hidden')
    expect(text.className).toContain('text-ellipsis')
  })
})
