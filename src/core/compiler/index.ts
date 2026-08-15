import { MihomoCompiler } from '../../targets/mihomo'
import { compilerRegistry } from './compilerTypes'

if (!compilerRegistry.get('mihomo')) compilerRegistry.register(new MihomoCompiler())

export * from './compilerTypes'
