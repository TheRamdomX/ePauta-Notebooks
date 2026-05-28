import { describe, it, expect } from 'vitest'
import {
  isCarrera,
  isValidExtension,
  getFileCategory,
  getFileExtension,
  formatFileName,
  getCourseUrl,
  getBreadcrumbUrl,
} from '../index'

describe('Type Guards', () => {
  describe('isCarrera', () => {
    it('returns true for valid careers', () => {
      expect(isCarrera('plan-comun')).toBe(true)
      expect(isCarrera('eit')).toBe(true)
      expect(isCarrera('eoc')).toBe(true)
      expect(isCarrera('eii')).toBe(true)
    })

    it('returns false for invalid careers', () => {
      expect(isCarrera('invalid')).toBe(false)
      expect(isCarrera('EIT')).toBe(false)
      expect(isCarrera('')).toBe(false)
      expect(isCarrera('plan')).toBe(false)
    })
  })

  describe('isValidExtension', () => {
    it('returns true for valid extensions', () => {
      expect(isValidExtension('pdf')).toBe(true)
      expect(isValidExtension('jpg')).toBe(true)
      expect(isValidExtension('docx')).toBe(true)
      expect(isValidExtension('xlsx')).toBe(true)
      expect(isValidExtension('pptx')).toBe(true)
    })

    it('returns false for invalid extensions', () => {
      expect(isValidExtension('txt')).toBe(false)
      expect(isValidExtension('exe')).toBe(false)
      expect(isValidExtension('')).toBe(false)
      expect(isValidExtension('PDF')).toBe(false) // Case sensitive
    })
  })
})

describe('File Utilities', () => {
  describe('getFileCategory', () => {
    it('categorizes PDF files correctly', () => {
      expect(getFileCategory('pdf')).toBe('pdf')
      expect(getFileCategory('PDF')).toBe('pdf')
    })

    it('categorizes image files correctly', () => {
      expect(getFileCategory('jpg')).toBe('image')
      expect(getFileCategory('jpeg')).toBe('image')
      expect(getFileCategory('png')).toBe('image')
      expect(getFileCategory('gif')).toBe('image')
      expect(getFileCategory('webp')).toBe('image')
    })

    it('categorizes office files correctly', () => {
      expect(getFileCategory('doc')).toBe('office')
      expect(getFileCategory('docx')).toBe('office')
      expect(getFileCategory('xls')).toBe('office')
      expect(getFileCategory('xlsx')).toBe('office')
      expect(getFileCategory('ppt')).toBe('office')
      expect(getFileCategory('pptx')).toBe('office')
    })

    it('returns unsupported for unknown extensions', () => {
      expect(getFileCategory('txt')).toBe('unsupported')
      expect(getFileCategory('exe')).toBe('unsupported')
      expect(getFileCategory('')).toBe('unsupported')
    })

    it('is case insensitive', () => {
      expect(getFileCategory('PDF')).toBe('pdf')
      expect(getFileCategory('JPG')).toBe('image')
      expect(getFileCategory('DOCX')).toBe('office')
    })
  })

  describe('getFileExtension', () => {
    it('extracts extension from file name', () => {
      expect(getFileExtension('document.pdf')).toBe('pdf')
      expect(getFileExtension('image.jpg')).toBe('jpg')
      expect(getFileExtension('file.test.docx')).toBe('docx')
    })

    it('extracts extension from URL', () => {
      expect(getFileExtension('https://example.com/file.pdf')).toBe('pdf')
      expect(getFileExtension('https://example.com/path/to/document.docx')).toBe('docx')
    })

    it('removes query parameters', () => {
      expect(getFileExtension('https://example.com/file.pdf?token=123')).toBe('pdf')
      expect(getFileExtension('document.pdf?v=1')).toBe('pdf')
    })

    it('returns pdf for files without extension', () => {
      expect(getFileExtension('document')).toBe('pdf')
      expect(getFileExtension('https://example.com/file')).toBe('pdf')
    })

    it('returns empty string for empty input', () => {
      expect(getFileExtension('')).toBe('')
    })

    it('converts to lowercase', () => {
      expect(getFileExtension('DOCUMENT.PDF')).toBe('pdf')
      expect(getFileExtension('Image.JPG')).toBe('jpg')
    })
  })

  describe('formatFileName', () => {
    it('removes file extension', () => {
      expect(formatFileName('document.pdf')).toBe('document')
      expect(formatFileName('image.jpg')).toBe('image')
    })

    it('replaces hyphens with spaces', () => {
      expect(formatFileName('my-document.pdf')).toBe('my document')
      expect(formatFileName('test-file-name.pdf')).toBe('test file name')
    })

    it('replaces underscores with spaces', () => {
      expect(formatFileName('my_document.pdf')).toBe('my document')
      expect(formatFileName('test_file_name.pdf')).toBe('test file name')
    })

    it('handles mixed separators', () => {
      expect(formatFileName('my-test_file.pdf')).toBe('my test file')
    })

    it('trims whitespace', () => {
      expect(formatFileName(' document.pdf ')).toBe('document')
      expect(formatFileName('  test-file.pdf  ')).toBe('test file')
    })
  })
})

describe('URL Utilities', () => {
  describe('getCourseUrl', () => {
    it('generates correct course URLs', () => {
      expect(getCourseUrl('plan-comun', 'MAT021')).toBe('/plan-comun/MAT021')
      expect(getCourseUrl('eit', 'IWG101')).toBe('/eit/IWG101')
      expect(getCourseUrl('eoc', 'ICE200')).toBe('/eoc/ICE200')
      expect(getCourseUrl('eii', 'IND100')).toBe('/eii/IND100')
    })
  })

  describe('getBreadcrumbUrl', () => {
    it('generates correct breadcrumb URLs', () => {
      expect(getBreadcrumbUrl('plan-comun')).toBe('/plan-comun')
      expect(getBreadcrumbUrl('eit')).toBe('/eit')
      expect(getBreadcrumbUrl('eoc')).toBe('/eoc')
      expect(getBreadcrumbUrl('eii')).toBe('/eii')
    })
  })
})
