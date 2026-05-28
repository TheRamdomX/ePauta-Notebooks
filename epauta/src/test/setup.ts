import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
/* eslint-disable @typescript-eslint/no-explicit-any */
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
} as any
/* eslint-enable @typescript-eslint/no-explicit-any */

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test_key',
    R2_SECRET_ACCESS_KEY: 'test_secret',
    R2_BUCKET_NAME: 'test-bucket',
    R2_PUBLIC_DOMAIN: 'https://test.domain.com',
  },
})
