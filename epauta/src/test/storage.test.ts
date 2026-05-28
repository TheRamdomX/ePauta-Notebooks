import { describe, it, expect } from 'vitest'
import { storage } from '../lib/storage'

describe('Storage Module', () => {
  it('should export storage object', () => {
    expect(storage).toBeDefined()
    expect(typeof storage.from).toBe('function')
  })

  it('should create storage instance with from method', () => {
    const bucketStorage = storage.from('test-bucket')
    expect(bucketStorage).toBeDefined()
    expect(typeof bucketStorage.list).toBe('function')
    expect(typeof bucketStorage.getPublicUrl).toBe('function')
    expect(typeof bucketStorage.createSignedUrl).toBe('function')
  })

  it('should return properly formatted public URL', () => {
    const bucketStorage = storage.from('recursos')
    const result = bucketStorage.getPublicUrl('test/file.pdf')

    expect(result.data).toBeDefined()
    expect(result.data.publicUrl).toBeDefined()
    expect(typeof result.data.publicUrl).toBe('string')
  })
})
