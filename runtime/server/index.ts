import { createRuntimeService } from './service'

const token = process.env.PROXYFLOW_RUNTIME_TOKEN
if (!token) throw new Error('Set PROXYFLOW_RUNTIME_TOKEN before starting ProxyFlow Runtime Service.')

const service = createRuntimeService({
  token,
  databasePath: process.env.PROXYFLOW_RUNTIME_DB ?? './proxyflow-runtime.sqlite',
  allowedOrigin: process.env.PROXYFLOW_RUNTIME_ORIGIN,
})
const port = Number(process.env.PORT ?? 8787)
const host = process.env.PROXYFLOW_RUNTIME_HOST ?? '127.0.0.1'
await service.listen(Number.isInteger(port) && port > 0 ? port : 8787, host)
