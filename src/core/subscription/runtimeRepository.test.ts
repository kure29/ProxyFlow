import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { parseSubscription } from './parseSubscription'
import { commitCandidate } from './refreshCoordinator'
import { IndexedDbSubscriptionRuntimeRepository, RUNTIME_STORAGE_SCHEMA_VERSION } from './runtimeRepository'
import { createSnapshotCandidate } from './snapshot'

describe('subscription IndexedDB runtime repository', () => {
  it('writes, reads, replaces and deletes active normalized snapshots', async () => {
    const factory = new IDBFactory()
    const repository = new IndexedDbSubscriptionRuntimeRepository(factory)
    const scope = cacheScope('fingerprint-a')
    const first = await snapshot('First', 'first.example.invalid', '2026-08-15T00:00:00.000Z')
    const second = await snapshot('Second', 'second.example.invalid', '2026-08-15T01:00:00.000Z')
    await repository.writeActive(scope, first)
    expect(await repository.readActive(scope)).toEqual(first)
    await repository.writeActive(scope, second)
    expect(await repository.readActive(scope)).toEqual(second)
    await repository.deleteActive(scope)
    expect(await repository.readActive(scope)).toBeUndefined()
  })

  it('misses when source config fingerprint changes', async () => {
    const repository = new IndexedDbSubscriptionRuntimeRepository(new IDBFactory())
    await repository.writeActive(cacheScope('fingerprint-a'), await snapshot('First', 'first.example.invalid'))
    expect(await repository.readActive(cacheScope('fingerprint-b'))).toBeUndefined()
  })

  it('discards only a malformed source cache without throwing', async () => {
    const factory = new IDBFactory()
    const repository = new IndexedDbSubscriptionRuntimeRepository(factory)
    const firstScope = cacheScope('fingerprint-a')
    const secondScope = { ...cacheScope('fingerprint-b'), sourceId: 'subscription-b' }
    await repository.writeActive(firstScope, await snapshot('First', 'first.example.invalid'))
    const second = await snapshot('Second', 'second.example.invalid')
    await repository.writeActive(secondScope, { ...second, sourceId: secondScope.sourceId, sourceConfigFingerprint: secondScope.sourceConfigFingerprint })
    await corruptActiveSnapshot(factory, firstScope)
    expect(await repository.readActive(firstScope)).toBeUndefined()
    expect(await repository.readActive(secondScope)).toEqual(expect.objectContaining({ sourceId: 'subscription-b' }))
  })

  it('does not delete another source snapshot when an active mapping crosses cache scopes', async () => {
    const factory = new IDBFactory()
    const repository = new IndexedDbSubscriptionRuntimeRepository(factory)
    const firstScope = cacheScope('fingerprint-a')
    const secondScope = { ...cacheScope('fingerprint-b'), sourceId: 'subscription-b' }
    await repository.writeActive(firstScope, await snapshot('First', 'first.example.invalid'))
    const second = await snapshot('Second', 'second.example.invalid')
    await repository.writeActive(secondScope, { ...second, sourceId: secondScope.sourceId, sourceConfigFingerprint: secondScope.sourceConfigFingerprint })
    await pointActiveMappingAtAnotherScope(factory, firstScope, secondScope)

    expect(await repository.readActive(firstScope)).toBeUndefined()
    expect(await repository.readActive(secondScope)).toEqual(expect.objectContaining({ sourceId: 'subscription-b' }))
  })

  it('discards a malformed nested endpoint without affecting another source', async () => {
    const factory = new IDBFactory()
    const repository = new IndexedDbSubscriptionRuntimeRepository(factory)
    const firstScope = cacheScope('fingerprint-a')
    const secondScope = { ...cacheScope('fingerprint-b'), sourceId: 'subscription-b' }
    await repository.writeActive(firstScope, await snapshot('First', 'first.example.invalid'))
    const second = await snapshot('Second', 'second.example.invalid')
    await repository.writeActive(secondScope, { ...second, sourceId: secondScope.sourceId, sourceConfigFingerprint: secondScope.sourceConfigFingerprint })
    await corruptNestedEndpoint(factory, firstScope)

    await expect(repository.readActive(firstScope)).resolves.toBeUndefined()
    expect(await repository.readActive(secondScope)).toEqual(expect.objectContaining({ sourceId: 'subscription-b' }))
  })

  it('exposes runtime schema version 1 independently from Project Schema', () => {
    expect(RUNTIME_STORAGE_SCHEMA_VERSION).toBe(1)
  })

  it('rejects isolated read and write failures', async () => {
    const unavailable = new IndexedDbSubscriptionRuntimeRepository(null as unknown as IDBFactory)
    await expect(unavailable.readActive(cacheScope('fingerprint-a'))).rejects.toThrow('IndexedDB is unavailable')
    await expect(unavailable.writeActive(cacheScope('fingerprint-a'), await snapshot('First', 'first.example.invalid'))).rejects.toThrow('IndexedDB is unavailable')
  })
})

function cacheScope(sourceConfigFingerprint: string) {
  return { projectId: 'project-a', sourceId: 'subscription-a', sourceConfigFingerprint }
}

async function snapshot(name: string, server: string, committedAt = '2026-08-15T00:00:00.000Z') {
  const body = `proxies:\n  - name: ${name}\n    type: socks5\n    server: ${server}\n    port: 1080`
  const result = parseSubscription(body, { sourceId: 'subscription-a' })
  const candidate = await createSnapshotCandidate({
    sourceId: 'subscription-a', inputKind: 'url', sourceConfigFingerprint: 'fingerprint-a', content: body, result,
    fetchedAt: committedAt, parsedAt: committedAt,
  })
  return commitCandidate(candidate, committedAt)
}

async function corruptActiveSnapshot(factory: IDBFactory, scope: ReturnType<typeof cacheScope>) {
  const database = await openRuntimeDatabase(factory)
  const transaction = database.transaction(['active', 'snapshots'], 'readwrite')
  const mapping = await getActiveMapping(transaction, scope)
  transaction.objectStore('snapshots').put({ key: mapping.snapshotKey, runtimeStorageSchemaVersion: 1, snapshot: { malformed: true } })
  await transactionComplete(transaction)
  database.close()
}

async function pointActiveMappingAtAnotherScope(
  factory: IDBFactory,
  sourceScope: ReturnType<typeof cacheScope>,
  targetScope: ReturnType<typeof cacheScope>,
) {
  const database = await openRuntimeDatabase(factory)
  const transaction = database.transaction('active', 'readwrite')
  const sourceMapping = await getActiveMapping(transaction, sourceScope)
  const targetMapping = await getActiveMapping(transaction, targetScope)
  transaction.objectStore('active').put({ ...sourceMapping, snapshotKey: targetMapping.snapshotKey })
  await transactionComplete(transaction)
  database.close()
}

async function corruptNestedEndpoint(factory: IDBFactory, scope: ReturnType<typeof cacheScope>) {
  const database = await openRuntimeDatabase(factory)
  const transaction = database.transaction(['active', 'snapshots'], 'readwrite')
  const mapping = await getActiveMapping(transaction, scope)
  const snapshots = transaction.objectStore('snapshots')
  const stored = await idbRequest<{ snapshot: { result: { proxies: unknown[] } } }>(snapshots.get(mapping.snapshotKey))
  stored.snapshot.result.proxies = [null]
  snapshots.put(stored)
  await transactionComplete(transaction)
  database.close()
}

function openRuntimeDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open('proxyflow.runtime.v1', 1)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

function getActiveMapping(transaction: IDBTransaction, scope: ReturnType<typeof cacheScope>) {
  const key = `${scope.projectId}\u0000${scope.sourceId}\u0000${scope.sourceConfigFingerprint}`
  return idbRequest<{ snapshotKey: string }>(transaction.objectStore('active').get(key))
}

function idbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
