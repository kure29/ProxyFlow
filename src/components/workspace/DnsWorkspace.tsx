import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown, Globe2, Plus, Server, Trash2 } from 'lucide-react'
import { getTargetCapabilities, type CapabilityStatus, type PrimaryTarget } from '../../core/capabilities'
import {
  appendCustomDnsResolver, appendDnsResolverPreset, deleteDnsResolver, DNS_RESOLVER_PRESETS,
  inferUniversalDnsMode, isUniversalDnsMode, normalizeDnsResolvers, patchDnsResolver, resolveDnsResolverRegion,
} from '../../core/dns/resolverProfiles'
import { isTargetNativeSurgeDnsBehaviorConfig, parseSurgeAlwaysRealIpDraft, type TargetNativeSurgeDnsBehaviorConfig } from '../../core/targetNative'
import type { DnsResolverConfig, DnsResolverKind, DnsResolverRole, UniversalDnsMode } from '../../types/project'
import { WebSelect } from '../ui/WebSelect'

export interface DnsWorkspaceCopy {
  emptyTitle: string
  emptyDescription: string
  addDns: string
  resolverDescription: string
  addResolver: string
  customResolver: string
  name: string
  protocol: string
  endpoint: string
  role: string
  enabled: string
  remove: string
  unsupported: string
  universalDnsMode?: string
  universalDnsModeNone?: string
  universalDnsModeAutomatic?: string
  universalDnsModeCustom?: string
  universalDnsModeDescription?: string
  alwaysRealIpLabel?: string
  alwaysRealIpDescription?: string
  alwaysRealIpPlaceholder?: string
  alwaysRealIpUnsupported?: string
  alwaysRealIpInvalid?: string
  alwaysRealIpMalformed?: string
  alwaysRealIpRemove?: string
  roles: Record<DnsResolverRole, string>
  regions: Record<'system' | 'global' | 'mainland-china', string>
}

export function DnsWorkspace({
  node, target, copy, onCreateDns, onChange,
}: {
  node?: { id: string; resolver?: string; dnsResolvers?: DnsResolverConfig[]; universalDnsMode?: UniversalDnsMode; targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorConfig }
  target: PrimaryTarget | null
  copy: DnsWorkspaceCopy
  onCreateDns: () => void
  onChange: (resolvers: DnsResolverConfig[], universalDnsMode?: UniversalDnsMode, targetNativeSurgeDnsBehavior?: TargetNativeSurgeDnsBehaviorConfig | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const addRootRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const focusMenuOnOpenRef = useRef(false)
  const resolvers = useMemo(
    () => normalizeDnsResolvers(node?.dnsResolvers, node?.resolver),
    [node?.dnsResolvers, node?.resolver],
  )
  const mode: UniversalDnsMode = isUniversalDnsMode(node?.universalDnsMode)
    ? node!.universalDnsMode
    : inferUniversalDnsMode(node?.dnsResolvers, node?.resolver)
  const rawNativeBehavior = node?.targetNativeSurgeDnsBehavior as unknown
  const validNativeBehavior = snapshotNativeBehavior(rawNativeBehavior)
  const hasNativeBehavior = rawNativeBehavior !== undefined
  const nativePatterns = validNativeBehavior?.alwaysRealIp ?? []
  const initialNativeDraft = nativePatterns.join('\n')
  const [alwaysRealIpDraft, setAlwaysRealIpDraft] = useState(initialNativeDraft)
  const [alwaysRealIpError, setAlwaysRealIpError] = useState<string | undefined>(
    hasNativeBehavior && !validNativeBehavior ? (copy.alwaysRealIpMalformed ?? 'Malformed persisted always-real-ip intent.') : undefined,
  )
  const nativeDraftRef = useRef(initialNativeDraft)
  useEffect(() => {
    nativeDraftRef.current = initialNativeDraft
    setAlwaysRealIpDraft(initialNativeDraft)
    setAlwaysRealIpError(hasNativeBehavior && !validNativeBehavior ? (copy.alwaysRealIpMalformed ?? 'Malformed persisted always-real-ip intent.') : undefined)
  }, [copy.alwaysRealIpMalformed, hasNativeBehavior, initialNativeDraft, node?.id, validNativeBehavior])
  useEffect(() => {
    if (!adding) return
    const focusFrame = focusMenuOnOpenRef.current
      ? window.requestAnimationFrame(() => addMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
      : undefined
    focusMenuOnOpenRef.current = false
    const closeOutside = (event: PointerEvent) => {
      if (!addRootRef.current?.contains(event.target as Node)) setAdding(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setAdding(false)
      addButtonRef.current?.focus()
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [adding])
  if (!node) return <div className="workspace-empty-state workspace-empty-state--action">
    <Globe2 size={28} />
    <strong>{copy.emptyTitle}</strong>
    <p>{copy.emptyDescription}</p>
    <button type="button" className="primary-action" onClick={onCreateDns}><Plus size={16} />{copy.addDns}</button>
  </div>

  const update = (id: string, patch: Partial<DnsResolverConfig>) => onChange(patchDnsResolver(resolvers, id, patch))
  const remove = (id: string) => onChange(deleteDnsResolver(resolvers, id))
  const closeAddMenu = (returnFocus = true) => {
    setAdding(false)
    if (returnFocus) window.requestAnimationFrame(() => addButtonRef.current?.focus())
  }
  const navigateAddMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowUp' ? (current <= 0 ? items.length - 1 : current - 1)
          : (current + 1) % items.length
    items[next]?.focus()
  }
  const openAddMenu = (focusFirstItem: boolean) => {
    focusMenuOnOpenRef.current = focusFirstItem
    setAdding(true)
  }
  const addPreset = (presetId: string, returnFocus: boolean) => {
    onChange(appendDnsResolverPreset(resolvers, presetId), 'custom')
    closeAddMenu(returnFocus)
  }
  const addCustom = (returnFocus: boolean) => {
    onChange(appendCustomDnsResolver(resolvers), 'custom')
    closeAddMenu(returnFocus)
  }
  const surgeNativeActive = target === 'surge'
  const commitAlwaysRealIp = () => {
    if (!surgeNativeActive) return
    const parsed = parseSurgeAlwaysRealIpDraft(alwaysRealIpDraft)
    if (!parsed.ok) {
      setAlwaysRealIpError(`${copy.alwaysRealIpInvalid ?? 'Invalid host pattern'}: ${parsed.invalidPattern}`)
      return
    }
    setAlwaysRealIpError(undefined)
    nativeDraftRef.current = parsed.patterns.join('\n')
    setAlwaysRealIpDraft(nativeDraftRef.current)
    const config = parsed.patterns.length > 0
      ? { target: 'surge' as const, kind: 'dns-behavior' as const, alwaysRealIp: parsed.patterns }
      : null
    onChange(resolvers, undefined, config)
  }

  return <div className={`dns-workspace${mode !== 'custom' ? ' dns-workspace--inactive' : ''}`}>
    <div className="workspace-section-intro">
      <label className="dns-mode-control"><span>{copy.universalDnsMode ?? 'Universal DNS intent'}</span><WebSelect
        label={copy.universalDnsMode ?? 'Universal DNS intent'}
        value={mode}
        onChange={(value) => isUniversalDnsMode(value) && onChange(resolvers, value)}
        options={[
          { value: 'none', label: copy.universalDnsModeNone ?? 'No Universal DNS' },
          { value: 'automatic', label: copy.universalDnsModeAutomatic ?? 'Automatic DNS' },
          { value: 'custom', label: copy.universalDnsModeCustom ?? 'Custom resolvers' },
        ]}
      /></label>
      <p>{copy.universalDnsModeDescription ?? copy.resolverDescription}</p>
      <div className="dns-add-menu" ref={addRootRef} onBlur={(event) => {
      if (adding && !event.currentTarget.contains(event.relatedTarget as Node | null)) setAdding(false)
    }}>
      <button ref={addButtonRef} type="button" className="primary-action" aria-haspopup="menu" aria-controls={adding ? 'dns-preset-menu' : undefined} aria-expanded={adding} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && !adding) { event.preventDefault(); openAddMenu(true) }
      }} onClick={(event) => adding ? closeAddMenu(event.detail === 0) : openAddMenu(event.detail === 0)}><Plus size={16} />{copy.addResolver}<ChevronDown size={14} /></button>
      {adding && <div ref={addMenuRef} id="dns-preset-menu" className="dns-preset-menu" role="menu" onKeyDown={navigateAddMenu}>
        {DNS_RESOLVER_PRESETS.map((preset) => {
          const status = dnsResolverCapability(target, preset.kind)
          return <button type="button" role="menuitem" key={preset.id} disabled={status === 'unsupported'} onClick={(event) => addPreset(preset.id, event.detail === 0)}>
            <Server size={17} /><span><strong>{preset.name}</strong><small>{preset.kind.toUpperCase()} · {copy.regions[preset.region]}</small></span>{status === 'unsupported' && <i>{copy.unsupported}</i>}
          </button>
        })}
        <button type="button" role="menuitem" onClick={(event) => addCustom(event.detail === 0)}><Globe2 size={17} /><span><strong>{copy.customResolver}</strong><small>DoH / DoT / UDP</small></span></button>
      </div>}
      </div></div>

    <section className={`dns-native-behavior${!surgeNativeActive ? ' is-unsupported' : ''}`} aria-labelledby="dns-always-real-ip-label">
      <div className="dns-native-behavior-heading">
        <label id="dns-always-real-ip-label" htmlFor="dns-always-real-ip"><strong>{copy.alwaysRealIpLabel ?? 'Surge always-real-ip'}</strong></label>
        <span>{!surgeNativeActive ? (copy.alwaysRealIpUnsupported ?? copy.unsupported) : 'Surge'}</span>
      </div>
      <p>{copy.alwaysRealIpDescription ?? 'DNS-node-owned host patterns that receive real IP answers from upstream DNS.'}</p>
      <textarea
        id="dns-always-real-ip"
        value={alwaysRealIpDraft}
        placeholder={copy.alwaysRealIpPlaceholder ?? 'example.com\n*.example.com'}
        disabled={!surgeNativeActive}
        readOnly={!surgeNativeActive}
        aria-invalid={Boolean(alwaysRealIpError)}
        className={alwaysRealIpError ? 'is-invalid' : undefined}
        onChange={(event) => { setAlwaysRealIpDraft(event.target.value); setAlwaysRealIpError(undefined) }}
        onBlur={commitAlwaysRealIp}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            commitAlwaysRealIp()
          }
        }}
      />
      {alwaysRealIpError && <small className="dns-native-behavior-error" role="alert">{alwaysRealIpError}</small>}
      {hasNativeBehavior && <button type="button" className="secondary-action dns-native-behavior-remove" onClick={() => onChange(resolvers, undefined, null)}>{copy.alwaysRealIpRemove ?? copy.remove}</button>}
    </section>

    {resolvers.length === 0
      ? <div className="workspace-empty-state"><Server size={24} /><strong>{copy.emptyTitle}</strong><p>{copy.emptyDescription}</p></div>
      : <div className="dns-resolver-list">{resolvers.map((resolver) => {
        const kindStatus = dnsResolverCapability(target, resolver.kind)
        const roleStatus = dnsRoleCapability(target, resolver.role)
        const unsupported = kindStatus === 'unsupported' || roleStatus === 'unsupported'
        const region = resolveDnsResolverRegion(resolver)
        return <article className={`${unsupported ? 'is-unsupported ' : ''}${mode !== 'custom' ? 'is-inactive' : ''}`} key={resolver.id}>
          <header><span><Server size={17} /><span><strong>{resolver.name}</strong><small>{resolver.kind.toUpperCase()}{region ? ` · ${copy.regions[region]}` : ''}</small></span></span>{unsupported && <em>{copy.unsupported}</em>}</header>
          <div className="dns-resolver-fields">
            <label><span>{copy.name}</span><input value={resolver.name} onChange={(event) => update(resolver.id, { name: event.target.value })} /></label>
            <label><span>{copy.protocol}</span><WebSelect label={copy.protocol} value={resolver.kind} invalid={kindStatus === 'unsupported'} onChange={(value) => update(resolver.id, { kind: value as DnsResolverKind })} options={(['doh', 'dot', 'udp', 'system'] as const).map((kind) => ({ value: kind, label: kind.toUpperCase(), disabled: dnsResolverCapability(target, kind) === 'unsupported' }))} /></label>
            <label className="dns-endpoint-field"><span>{copy.endpoint}</span><input value={resolver.address ?? ''} disabled={resolver.kind === 'system'} onChange={(event) => update(resolver.id, { address: event.target.value })} /></label>
            <label><span>{copy.role}</span><WebSelect label={copy.role} value={resolver.role} invalid={roleStatus === 'unsupported'} onChange={(value) => update(resolver.id, { role: value as DnsResolverRole })} options={(['default', 'direct', 'fallback'] as const).map((role) => ({ value: role, label: copy.roles[role], disabled: dnsRoleCapability(target, role) === 'unsupported' }))} /></label>
          </div>
          <footer><label className="dns-enabled-toggle"><input type="checkbox" checked={resolver.enabled} onChange={(event) => update(resolver.id, { enabled: event.target.checked })} /><span>{copy.enabled}</span></label><button type="button" className="icon-button" aria-label={`${copy.remove}: ${resolver.name}`} title={copy.remove} onClick={() => remove(resolver.id)}><Trash2 size={16} /></button></footer>
        </article>
      })}</div>}
  </div>
}

function dnsResolverCapability(target: PrimaryTarget | null, kind: DnsResolverKind): CapabilityStatus | 'unknown' {
  return target ? getTargetCapabilities(target).dns[kind].status : 'unknown'
}

function snapshotNativeBehavior(value: unknown): TargetNativeSurgeDnsBehaviorConfig | undefined {
  if (!isTargetNativeSurgeDnsBehaviorConfig(value)) return undefined
  try {
    const snapshot = structuredClone(value)
    return isTargetNativeSurgeDnsBehaviorConfig(snapshot) ? snapshot : undefined
  } catch {
    return undefined
  }
}

function dnsRoleCapability(target: PrimaryTarget | null, role: DnsResolverRole): CapabilityStatus | 'unknown' {
  return target ? getTargetCapabilities(target).dns[`${role}-role`].status : 'unknown'
}
