import { describe, expect, it } from 'vitest'
import { groupByDay } from '../src/core/group'
import { normalize, parseTime } from '../src/core/normalize'
import type { PhotoItem } from '../src/core/types'

const photo = (over: Partial<PhotoItem> = {}): PhotoItem => ({
  id: 'a',
  width: 100,
  height: 50,
  takenAt: '2024-05-04T10:00:00Z',
  thumbUrl: '/a.jpg',
  ...over,
})

describe('parseTime', () => {
  it('treats a bare YYYY-MM-DD as a local date', () => {
    const time = parseTime('2023-11-07')
    const date = new Date(time)
    // Not UTC-shifted: the day must survive in the viewer's own timezone.
    expect(date.getFullYear()).toBe(2023)
    expect(date.getMonth()).toBe(10)
    expect(date.getDate()).toBe(7)
  })

  it('accepts numbers, Dates and ISO strings', () => {
    expect(parseTime(1700000000000)).toBe(1700000000000)
    expect(parseTime(new Date(1700000000000))).toBe(1700000000000)
    expect(parseTime('2024-05-04T10:00:00Z')).toBe(Date.parse('2024-05-04T10:00:00Z'))
  })

  it('reports unparseable values as NaN', () => {
    expect(Number.isNaN(parseTime('not a date'))).toBe(true)
    expect(Number.isNaN(parseTime(undefined))).toBe(true)
  })
})

describe('normalize', () => {
  it('sorts newest first by default and assigns indices', () => {
    const { photos } = normalize([
      photo({ id: 'old', takenAt: '2020-01-01' }),
      photo({ id: 'new', takenAt: '2024-01-01' }),
      photo({ id: 'mid', takenAt: '2022-01-01' }),
    ])
    expect(photos.map((p) => p.id)).toEqual(['new', 'mid', 'old'])
    expect(photos.map((p) => p.index)).toEqual([0, 1, 2])
  })

  it('honours ascending order', () => {
    const { photos } = normalize(
      [photo({ id: 'b', takenAt: '2024-01-01' }), photo({ id: 'a', takenAt: '2020-01-01' })],
      'asc',
    )
    expect(photos.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('rejects rather than mis-lays out bad input', () => {
    const { photos, rejected } = normalize([
      photo({ id: 'ok' }),
      photo({ id: 'nowidth', width: 0 }),
      photo({ id: 'nodate', takenAt: 'nope' }),
      photo({ id: 'nourl', thumbUrl: '', url: undefined }),
      photo({ id: 'ok' }),
    ])
    expect(photos.map((p) => p.id)).toEqual(['ok'])
    expect(rejected.map((r) => r.reason)).toEqual([
      'width/height must be positive numbers',
      'takenAt could not be parsed',
      'thumbUrl or url is required',
      'duplicate id "ok"',
    ])
  })

  it('falls back from url to thumbUrl and back', () => {
    const { photos } = normalize([
      photo({ id: 'a', thumbUrl: '/thumb.jpg' }),
      photo({ id: 'b', thumbUrl: '', url: '/full.jpg' }),
    ])
    expect(photos.find((p) => p.id === 'a')!.url).toBe('/thumb.jpg')
    expect(photos.find((p) => p.id === 'b')!.thumbUrl).toBe('/full.jpg')
  })

  it('keeps arbitrary business fields on `raw`', () => {
    const { photos } = normalize([photo({ albumId: 42 })])
    expect(photos[0].raw.albumId).toBe(42)
  })
})

describe('groupByDay', () => {
  it('buckets consecutive photos and preserves order', () => {
    const { photos } = normalize([
      photo({ id: 'a', takenAt: '2024-05-04T09:00:00' }),
      photo({ id: 'b', takenAt: '2024-05-04T20:00:00' }),
      photo({ id: 'c', takenAt: '2024-05-03T09:00:00' }),
    ])
    const groups = groupByDay(photos)

    expect(groups.map((g) => g.key)).toEqual(['2024-05-04', '2024-05-03'])
    expect(groups[0].photos.map((p) => p.id)).toEqual(['b', 'a'])
    expect(groups[0]).toMatchObject({ year: 2024, month: 5, day: 4 })
  })

  it('pads month and day in the key', () => {
    const { photos } = normalize([photo({ takenAt: '2024-01-02' })])
    expect(groupByDay(photos)[0].key).toBe('2024-01-02')
  })
})
