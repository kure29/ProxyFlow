import type { TargetClient } from '../../types/output'
import type { OutputId } from './references'

export interface OutputIR {
  id: OutputId
  name: string
  target: TargetClient
  enabled: boolean
}
