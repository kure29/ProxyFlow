import openAiMark from '../../assets/services/marks/openai.svg'
import claudeMark from '../../assets/services/marks/claude.svg'
import googleMark from '../../assets/services/marks/google.svg'
import geminiMark from '../../assets/services/marks/gemini.svg'
import youtubeMark from '../../assets/services/marks/youtube.svg'
import netflixMark from '../../assets/services/marks/netflix.svg'
import disneyMark from '../../assets/services/marks/disney.svg'
import telegramMark from '../../assets/services/marks/telegram.svg'
import githubMark from '../../assets/services/marks/github.svg'
import steamMark from '../../assets/services/marks/steam.svg'

export type ServiceMarkMode = 'monochrome' | 'fixed'
export type ServiceMarkId = keyof typeof serviceMarkDefinitions

export interface ServiceMarkDefinition {
  asset: string
  mode: ServiceMarkMode
  opticalWidth: number
  opticalHeight: number
}

export const serviceMarkDefinitions = {
  openai: { asset: openAiMark, mode: 'monochrome', opticalWidth: 20, opticalHeight: 20 },
  claude: { asset: claudeMark, mode: 'fixed', opticalWidth: 20, opticalHeight: 20 },
  google: { asset: googleMark, mode: 'fixed', opticalWidth: 19, opticalHeight: 19 },
  gemini: { asset: geminiMark, mode: 'fixed', opticalWidth: 19, opticalHeight: 19 },
  youtube: { asset: youtubeMark, mode: 'monochrome', opticalWidth: 21, opticalHeight: 17 },
  netflix: { asset: netflixMark, mode: 'fixed', opticalWidth: 27, opticalHeight: 13 },
  disney: { asset: disneyMark, mode: 'monochrome', opticalWidth: 26, opticalHeight: 20 },
  telegram: { asset: telegramMark, mode: 'fixed', opticalWidth: 18, opticalHeight: 18 },
  github: { asset: githubMark, mode: 'monochrome', opticalWidth: 20, opticalHeight: 20 },
  steam: { asset: steamMark, mode: 'monochrome', opticalWidth: 20, opticalHeight: 20 },
} as const satisfies Record<string, ServiceMarkDefinition>

export const serviceMarkIds = Object.freeze(Object.keys(serviceMarkDefinitions) as ServiceMarkId[])

const markAliases = new Map<string, ServiceMarkId>([
  ...serviceMarkIds.map((id) => [id, id] as const),
  ['disney+', 'disney'],
])

export function resolveServiceMarkId(value: string): ServiceMarkId | undefined {
  return markAliases.get(value.trim().toLocaleLowerCase())
}

export function getServiceMarkDefinition(value: string): ServiceMarkDefinition | undefined {
  const id = resolveServiceMarkId(value)
  return id ? serviceMarkDefinitions[id] : undefined
}
