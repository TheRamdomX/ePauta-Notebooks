import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../ErrorBoundary'

// Componente que lanza un error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders error UI when child component throws', () => {
    // Suprimir error en consola durante el test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Error al cargar el componente')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('displays custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const customFallback = <div>Custom error message</div>

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error message')).toBeInTheDocument()
    expect(screen.queryByText('Error al cargar el componente')).not.toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('calls onError callback when error is caught', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onErrorMock = vi.fn()

    render(
      <ErrorBoundary onError={onErrorMock}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(onErrorMock).toHaveBeenCalled()
    expect(onErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    )

    consoleSpy.mockRestore()
  })

  it('resets error state when "Intentar de nuevo" is clicked', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    let shouldThrow = true
    const TestComponent = () => <ThrowError shouldThrow={shouldThrow} />

    const { rerender } = render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    )

    // Verificar que se muestra el error
    expect(screen.getByText('Error al cargar el componente')).toBeInTheDocument()

    // Cambiar el estado para que no lance error
    shouldThrow = false

    // Click en el botón de retry
    const retryButton = screen.getByRole('button', { name: /intentar de nuevo/i })
    await user.click(retryButton)

    // Forzar re-render
    rerender(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    )

    // Verificar que se muestra el contenido normal
    expect(screen.getByText('No error')).toBeInTheDocument()
    expect(screen.queryByText('Error al cargar el componente')).not.toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('resets error state when resetKeys change', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rerender } = render(
      <ErrorBoundary resetKeys={['key1']}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // Verificar que se muestra el error
    expect(screen.getByText('Error al cargar el componente')).toBeInTheDocument()

    // Cambiar resetKeys y no lanzar error
    rerender(
      <ErrorBoundary resetKeys={['key2']}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )

    // Verificar que se muestra el contenido normal
    expect(screen.getByText('No error')).toBeInTheDocument()
    expect(screen.queryByText('Error al cargar el componente')).not.toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('has correct accessibility attributes in error state', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    const retryButton = screen.getByRole('button', { name: /intentar de nuevo/i })

    expect(retryButton).toHaveAttribute('class')
    expect(retryButton.className).toContain('focus:ring-2')

    consoleSpy.mockRestore()
  })
})
