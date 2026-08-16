import { compilerRegistry } from './compilerTypes'

if (!compilerRegistry.has('mihomo')) compilerRegistry.register('mihomo', async () => {
  const { MihomoCompiler } = await import('../../targets/mihomo')
  return new MihomoCompiler()
})

if (!compilerRegistry.has('sing-box')) compilerRegistry.register('sing-box', async () => {
  const { SingBoxCompiler } = await import('../../targets/singbox')
  return new SingBoxCompiler()
})

export * from './compilerTypes'
export * from './diagnostics'
