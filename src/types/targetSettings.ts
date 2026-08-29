/**
 * User-managed settings owned by the Mihomo target branch.
 *
 * The fields are intentionally optional: an omitted value keeps the
 * compiler's existing default (or a legacy output profile value). Explicit
 * false is preserved and applied by the target compiler.
 */
export interface MihomoTargetSettings {
  mixedPort?: number
  allowLan?: boolean
  ipv6?: boolean
}

/** Target-owned settings persisted on a Project. */
export interface TargetSettings {
  mihomo?: MihomoTargetSettings
}
