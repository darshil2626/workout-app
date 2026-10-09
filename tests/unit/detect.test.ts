import { describe, expect, it } from 'vitest'
import { detectFormat } from '../../src/lib/importers/detect'
import { APP_MARKER } from '../../src/lib/backup'

const STRONG_HEADER = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const HEVY_HEADER = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'

describe('detectFormat', () => {
  it('recognises our own backup by shape', () => {
    expect(detectFormat(JSON.stringify({ version: 3, workouts: [], exercises: [] }))).toBe('backup')
  })
  it('recognises a backup by the app marker alone (and claims malformed ones)', () => {
    expect(detectFormat(JSON.stringify({ app: APP_MARKER }))).toBe('backup')
    expect(detectFormat(JSON.stringify({ app: APP_MARKER, version: 'x' }))).toBe('backup')
  })
  it('a marker-less backup shape is enough (older names)', () => {
    expect(detectFormat(JSON.stringify({ app: 'oldname', version: 1, workouts: [], exercises: [] }))).toBe('backup')
  })
  it('other JSON is unknown', () => {
    expect(detectFormat('{"hello":"world"}')).toBe('unknown')
    expect(detectFormat('{"version":"1","workouts":[],"exercises":[]}')).toBe('unknown')
    expect(detectFormat('{"version":1,"workouts":{},"exercises":[]}')).toBe('unknown')
  })
  it('malformed JSON is unknown, not a throw', () => {
    expect(detectFormat('{"version":1,')).toBe('unknown')
    expect(detectFormat('{')).toBe('unknown')
  })
  it('JSON arrays and scalars are unknown', () => {
    expect(detectFormat('[1,2,3]')).toBe('unknown')
    expect(detectFormat('"str"')).toBe('unknown')
  })
  it('hevy and strong headers', () => {
    expect(detectFormat(`${HEVY_HEADER}\nrow`)).toBe('hevy')
    expect(detectFormat(`${STRONG_HEADER}\nrow`)).toBe('strong')
  })
  it('header matching is case-insensitive and tolerates CRLF, BOM and leading whitespace', () => {
    expect(detectFormat(`﻿${STRONG_HEADER.toUpperCase()}\r\nrow`)).toBe('strong')
    expect(detectFormat(`\n  ${HEVY_HEADER}\r\n`)).toBe('hevy')
  })
  it('strong semicolon variant', () => {
    expect(detectFormat('Date;Workout Name;Set Order;Weight (kg)')).toBe('strong')
  })
  it('only the first line is considered', () => {
    expect(detectFormat(`a,b\n${STRONG_HEADER}`)).toBe('unknown')
  })
  it('unrelated CSV, empty and whitespace are unknown', () => {
    expect(detectFormat('a,b,c\n1,2,3')).toBe('unknown')
    expect(detectFormat('')).toBe('unknown')
    expect(detectFormat('   \n  ')).toBe('unknown')
  })
  it('requires both identifying columns', () => {
    expect(detectFormat('exercise_title,reps')).toBe('unknown')
    expect(detectFormat('workout name,reps')).toBe('unknown')
  })
})
