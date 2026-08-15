import { describe, expect, it } from 'vitest'
import { demoProject } from '../../data/demoProject'
import { migrateProject, PROJECT_SCHEMA_VERSION } from './version'

describe('project schema version', () => {
  it('keeps project schema and IR schema version strategies separate', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(1)
    expect(migrateProject(demoProject)).toEqual(expect.objectContaining({ success: true, project: demoProject }))
  })

  it('fails closed for unknown project versions', () => {
    expect(migrateProject({ ...demoProject, version: 99 })).toEqual(expect.objectContaining({ success: false, fromVersion: 99, toVersion: 1 }))
  })
})
