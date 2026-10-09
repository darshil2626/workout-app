import { describe, expect, it } from 'vitest'
import { parseCsv, sniffDelimiter, toRecords } from '../../src/lib/importers/csv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('handles a missing trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('quoted fields keep commas', () => {
    expect(parseCsv('"Press, Bench",5')).toEqual([['Press, Bench', '5']])
  })
  it('quoted fields keep embedded newlines (verbatim)', () => {
    expect(parseCsv('"line1\nline2",x\n')).toEqual([['line1\nline2', 'x']])
    expect(parseCsv('"a\r\nb",x')).toEqual([['a\r\nb', 'x']])
  })
  it('doubled quotes are an escaped quote', () => {
    expect(parseCsv('"He said ""hi""",2')).toEqual([['He said "hi"', '2']])
    expect(parseCsv('""""')).toEqual([['"']])
  })
  it('empty quoted field is an empty string', () => {
    expect(parseCsv('a,"",c')).toEqual([['a', '', 'c']])
  })
  it('keeps empty fields, including trailing delimiter', () => {
    expect(parseCsv('a,,c\n,,\n1,2,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
      ['1', '2', ''],
    ])
  })
  it('drops completely blank lines', () => {
    expect(parseCsv('a,b\n\n\n1,2\n   \n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n\n')).toEqual([])
  })
  it('custom delimiter leaves commas alone', () => {
    expect(parseCsv('a;b,c;d\n1;2;3', ';')).toEqual([
      ['a', 'b,c', 'd'],
      ['1', '2', '3'],
    ])
  })
  it('unterminated quote swallows the rest of the file but does not throw', () => {
    const rows = parseCsv('a,b\n"oops,1\n2,3\n')
    expect(rows[0]).toEqual(['a', 'b'])
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('oops,1\n2,3\n')
  })
  it('a quote in the middle of an unquoted field starts quoting (lenient)', () => {
    expect(() => parseCsv('ab"c,d"\n1,2')).not.toThrow()
  })
  it('whitespace around fields is preserved', () => {
    expect(parseCsv(' a , b ')).toEqual([[' a ', ' b ']])
  })
  it('unicode survives', () => {
    expect(parseCsv('Café,日本')).toEqual([['Café', '日本']])
  })
  it('ragged rows are returned as-is', () => {
    expect(parseCsv('a,b,c\n1\n1,2,3,4')).toEqual([['a', 'b', 'c'], ['1'], ['1', '2', '3', '4']])
  })
})

describe('sniffDelimiter', () => {
  it('prefers comma by default', () => expect(sniffDelimiter('a,b,c')).toBe(','))
  it('picks semicolon when it splits more', () => expect(sniffDelimiter('a;b;c')).toBe(';'))
  it('tie goes to comma', () => expect(sniffDelimiter('a,b;c')).toBe(','))
  it('no delimiters at all -> comma', () => expect(sniffDelimiter('single')).toBe(','))
  it('empty -> comma', () => expect(sniffDelimiter('')).toBe(','))
  it('decimal commas inside a semicolon header can fool it only when commas outnumber', () => {
    expect(sniffDelimiter('Date;Weight;Reps')).toBe(';')
  })
})

describe('toRecords', () => {
  it('keys rows by lowercased, trimmed header', () => {
    expect(
      toRecords([
        [' Date ', 'Exercise Name'],
        ['2024-01-01', 'Squat'],
      ]),
    ).toEqual([{ date: '2024-01-01', 'exercise name': 'Squat' }])
  })
  it('pads short rows with empty strings and ignores extra cells', () => {
    const r = toRecords([['a', 'b'], ['1'], ['1', '2', '3']])
    expect(r).toEqual([
      { a: '1', b: '' },
      { a: '1', b: '2' },
    ])
  })
  it('empty and header-only input', () => {
    expect(toRecords([])).toEqual([])
    expect(toRecords([['a']])).toEqual([])
  })
  it('a leading BOM does not break the first header', () => {
    expect(toRecords(parseCsv('﻿Date,Reps\n2024,5'))[0]).toEqual({ date: '2024', reps: '5' })
  })
  it('duplicate headers: later column wins', () => {
    expect(
      toRecords([
        ['a', 'a'],
        ['1', '2'],
      ]),
    ).toEqual([{ a: '2' }])
  })
})
