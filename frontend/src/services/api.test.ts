import { describe, it, expect } from 'vitest'
import { TMDB_IMAGE } from './api'

describe('TMDB_IMAGE', () => {
  it('returns null when given a null path', () => {
    expect(TMDB_IMAGE(null)).toBeNull()
  })

  it('builds a full TMDB CDN url with the default size', () => {
    expect(TMDB_IMAGE('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w342/abc123.jpg')
  })

  it('respects a custom size', () => {
    expect(TMDB_IMAGE('/abc123.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg')
  })
})
