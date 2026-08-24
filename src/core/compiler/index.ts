import { compilerRegistry } from './compilerTypes'

if (!compilerRegistry.has('mihomo')) compilerRegistry.register('mihomo', async () => {
  const { MihomoCompiler } = await import('../../targets/mihomo')
  return new MihomoCompiler()
})

if (!compilerRegistry.has('sing-box')) compilerRegistry.register('sing-box', async () => {
  const { SingBoxCompiler } = await import('../../targets/singbox')
  return new SingBoxCompiler()
})

if (!compilerRegistry.has('surge')) compilerRegistry.register('surge', async () => {
  const { SurgeCompiler } = await import('../../targets/surge')
  return new SurgeCompiler()
})

if (!compilerRegistry.has('loon')) compilerRegistry.register('loon', async () => {
  const { LoonCompiler } = await import('../../targets/loon')
  return new LoonCompiler()
})

export * from './compilerTypes'
export * from './diagnostics'
