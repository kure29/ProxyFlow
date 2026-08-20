import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown, Globe2, Plus, Server, Trash2 } from 'lucide-react'
import { getTargetCapabilities, type CapabilityStatus, type PrimaryTarget } from '../../core/capabilities'
import {
  createCustomDnsResolver, createDnsResolver, DNS_RESOLVER_PRESETS, normalizeDnsResolvers,
  resolveDnsResolverRegion,
} from '../../core/dns/resolverProfiles'
import type { DnsResolverConfig, DnsResolverKind, DnsResolverRole } from '../../types/project'

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
  roles: Record<DnsResolverRole, string>
  regions: Record<'system' | 'global' | 'mainland-china', string>
}

export function DnsWorkspace({
  node, target, copy, onCreateDns, onChange,
}: {
  node?: { id: string; resolver?: string; dnsResolvers?: DnsResolverConfig[] }
  target: PrimaryTarget | null
  copy: DnsWorkspaceCopy
  onCreateDns: () => void
  onChange: (resolvers: DnsResolverConfig[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const addRootRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const resolvers = useMemo(
    () => normalizeDnsResolvers(node?.dnsResolvers, node?.resolver),
    [node?.dnsResolvers, node?.resolver],
  )
  useEffect(() => {
    if (!adding) return
    const focusFrame = window.requestAnimationFrame(() => addMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus())
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
      window.cancelAnimationFrame(focusFrame)
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

  const update = (id: string, patch: Partial<DnsResolverConfig>) => onChange(resolvers.map((resolver) => resolver.id === id ? { ...resolver, ...patch } : resolver))
  const remove = (id: string) => onChange(resolvers.filter((resolver) => resolver.id !== id))
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
  const addPreset = (presetId: string) => {
    const resolver = createDnsResolver(presetId, 'default', resolvers)
    if (resolver) onChange([...resolvers, resolver])
    closeAddMenu()
  }
  const addCustom = () => {
    onChange([...resolvers, createCustomDnsResolver(resolvers)])
    closeAddMenu()
  }

  return <div className="dns-workspace">
    <div className="workspace-section-intro"><p>{copy.resolverDescription}</p><div className="dns-add-menu" ref={addRootRef} onBlur={(event) => {
      if (adding && !event.currentTarget.contains(event.relatedTarget as Node | null)) setAdding(false)
    }}>
      <button ref={addButtonRef} type="button" className="primary-action" aria-haspopup="menu" aria-controls={adding ? 'dns-preset-menu' : undefined} aria-expanded={adding} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && !adding) { event.preventDefault(); setAdding(true) }
      }} onClick={() => adding ? closeAddMenu() : setAdding(true)}><Plus size={16} />{copy.addResolver}<ChevronDown size={14} /></button>
      {adding && <div ref={addMenuRef} id="dns-preset-menu" className="dns-preset-menu" role="menu" onKeyDown={navigateAddMenu}>
        {DNS_RESOLVER_PRESETS.map((preset) => {
          const status = resolverCapability(target, preset.kind)
          return <button type="button" role="menuitem" key={preset.id} disabled={status === 'unsupported'} onClick={() => addPreset(preset.id)}>
            <Server size={17} /><span><strong>{preset.name}</strong><small>{preset.kind.toUpperCase()} · {copy.regions[preset.region]}</small></span>{status === 'unsupported' && <i>{copy.unsupported}</i>}
          </button>
        })}
        <button type="button" role="menuitem" onClick={addCustom}><Globe2 size={17} /><span><strong>{copy.customResolver}</strong><small>DoH / DoT / UDP</small></span></button>
      </div>}
    </div></div>

    {resolvers.length === 0
      ? <div className="workspace-empty-state"><Server size={24} /><strong>{copy.emptyTitle}</strong><p>{copy.emptyDescription}</p></div>
      : <div className="dns-resolver-list">{resolvers.map((resolver) => {
        const kindStatus = resolverCapability(target, resolver.kind)
        const roleStatus = roleCapability(target, resolver.role)
        const unsupported = kindStatus === 'unsupported' || roleStatus === 'unsupported'
        const region = resolveDnsResolverRegion(resolver)
        return <article className={unsupported ? 'is-unsupported' : ''} key={resolver.id}>
          <header><span><Server size={17} /><span><strong>{resolver.name}</strong><small>{resolver.kind.toUpperCase()}{region ? ` · ${copy.regions[region]}` : ''}</small></span></span>{unsupported && <em>{copy.unsupported}</em>}</header>
          <div className="dns-resolver-fields">
            <label><span>{copy.name}</span><input value={resolver.name} onChange={(event) => update(resolver.id, { name: event.target.value })} /></label>
            <label><span>{copy.protocol}</span><select value={resolver.kind} onChange={(event) => update(resolver.id, { kind: event.target.value as DnsResolverKind })}>{(['doh', 'dot', 'udp', 'system'] as const).map((kind) => <option key={kind} value={kind} disabled={resolverCapability(target, kind) === 'unsupported'}>{kind.toUpperCase()}</option>)}</select></label>
            <label className="dns-endpoint-field"><span>{copy.endpoint}</span><input value={resolver.address ?? ''} disabled={resolver.kind === 'system'} onChange={(event) => update(resolver.id, { address: event.target.value })} /></label>
            <label><span>{copy.role}</span><select value={resolver.role} onChange={(event) => update(resolver.id, { role: event.target.value as DnsResolverRole })}>{(['default', 'direct', 'fallback'] as const).map((role) => <option key={role} value={role} disabled={roleCapability(target, role) === 'unsupported'}>{copy.roles[role]}</option>)}</select></label>
          </div>
          <footer><label className="dns-enabled-toggle"><input type="checkbox" checked={resolver.enabled} onChange={(event) => update(resolver.id, { enabled: event.target.checked })} /><span>{copy.enabled}</span></label><button type="button" className="icon-button" aria-label={`${copy.remove}: ${resolver.name}`} title={copy.remove} onClick={() => remove(resolver.id)}><Trash2 size={16} /></button></footer>
        </article>
      })}</div>}
  </div>
}

function resolverCapability(target: PrimaryTarget | null, kind: DnsResolverKind): CapabilityStatus | 'unknown' {
  return target ? getTargetCapabilities(target).dns[kind].status : 'unknown'
}

function roleCapability(target: PrimaryTarget | null, role: DnsResolverRole): CapabilityStatus | 'unknown' {
  return target ? getTargetCapabilities(target).dns[`${role}-role`].status : 'unknown'
}
