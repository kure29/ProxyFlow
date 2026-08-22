import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Clipboard, Download, Eye, Laptop, LoaderCircle, Network, Server, ShieldCheck, X } from 'lucide-react'
import { getTargetCapabilities, PRIMARY_TARGETS, type PrimaryTarget } from '../../core/capabilities'
import type { StructuredDiagnostic } from '../../core/compiler'
import { outputDefinitions } from '../../data/demoProject'
import { useI18n } from '../../i18n'
import type { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { AssetIcon } from '../icons/AssetIcon'
import { useBuilderStore } from '../../store/useBuilderStore'
import { createMihomoOutputProfile, resolveMihomoOutputProfile } from '../../targets/mihomo/profile'
import type { MihomoDnsMode, MihomoOutputProfile, MihomoRuntimePreset, MihomoTunStack } from '../../types/project'
import { buildTargetExportArtifact } from '../compiler/exportFile'
import { countEnabledDnsResolvers } from '../../core/dns/resolverProfiles'
import { WebSelect } from '../ui/WebSelect'

export type ProjectCompiles = ReturnType<typeof useProjectCompiles>

interface TargetSwitchDialogProps {
  open: boolean
  current: PrimaryTarget | null
  compiles: ProjectCompiles
  onClose: () => void
  onSelect: (target: PrimaryTarget) => void
}

export function TargetSwitchDialog({ open, current, compiles, onClose, onSelect }: TargetSwitchDialogProps) {
  const { t } = useI18n()
  const [candidate, setCandidate] = useState<PrimaryTarget>(current ?? 'mihomo')
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    setCandidate(current ?? 'mihomo')
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
      returnFocusRef.current?.focus()
    }
  }, [current, onClose, open])
  if (!open) return null

  return <div className="target-switch-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={panelRef} className="target-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="target-switch-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>{t('workspace.primaryTarget')}</span><h2 id="target-switch-title">{t('workspace.switchTarget')}</h2></div><button ref={closeRef} type="button" aria-label={t('workspace.closeTargetSwitch')} onClick={onClose}><X size={18} /></button></header>
      <p>{t('workspace.switchTargetDescription')}</p>
      <div className="target-switch-options">{PRIMARY_TARGETS.map((target) => <button type="button" className={candidate === target ? 'is-selected' : ''} aria-pressed={candidate === target} key={target} onClick={() => setCandidate(target)}>
        <TargetArtwork target={target} />
        <TargetStatus target={target} state={stateForTarget(compiles, target)} graphIssues={compiles.graphResult.issues} />
        <i>{candidate === target ? t('newProject.selected') : t('newProject.select')}</i>
      </button>)}</div>
      <aside><ShieldCheck size={16} /><span>{t('workspace.switchTargetPreserves')}</span></aside>
      <footer><button type="button" className="secondary-action" onClick={onClose}>{t('preview.close')}</button><button type="button" className="primary-action" onClick={() => onSelect(candidate)}>{candidate === current ? t('workspace.keepTarget') : t('workspace.useTarget', { target: getTargetCapabilities(candidate).label })}</button></footer>
    </section>
  </div>
}

export function WorkspaceExportPanel({ primaryTarget, compiles, onPreview, onSelectTarget }: {
  primaryTarget: PrimaryTarget | null
  compiles: ProjectCompiles
  onPreview: (target: PrimaryTarget) => void
  onSelectTarget?: (target: PrimaryTarget) => void
}) {
  const { t } = useI18n()
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const updateNodeData = useBuilderStore((state) => state.updateNodeData)
  const setToast = useBuilderStore((state) => state.setToast)
  const [copied, setCopied] = useState(false)
  const activeTarget = primaryTarget ?? 'mihomo'
  const output = nodes.find((node) => node.data.blockType === 'output' && !node.data.disabled)
  const mihomoProfile = resolveMihomoOutputProfile(output?.data.mihomoProfile)
  const dnsResolverCount = nodes.filter((node) => node.data.blockType === 'dns' && !node.data.disabled)
    .reduce((count, node) => count + countEnabledDnsResolvers(node.data.dnsResolvers, node.data.resolver), 0)
  const state = stateForTarget(compiles, activeTarget)
  const status = targetStatus(state, compiles.graphResult.issues)
  const artifact = buildTargetExportArtifact(projectName, activeTarget, state.result)
  const setMihomoProfile = (patch: Partial<MihomoOutputProfile>) => {
    if (output) updateNodeData(output.id, { mihomoProfile: { ...mihomoProfile, ...patch } })
  }
  const setPreset = (preset: MihomoRuntimePreset) => {
    const defaults = createMihomoOutputProfile(preset)
    setMihomoProfile({ preset, dnsMode: defaults.dnsMode, sniffer: defaults.sniffer, strictRoute: preset === 'desktop-tun' ? mihomoProfile.strictRoute : false })
  }
  const download = () => {
    if (!artifact) return
    const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = artifact.filename
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(t('workspace.export.downloaded', { target: getTargetCapabilities(activeTarget).label }))
  }
  const copy = async () => {
    if (!artifact) return
    await navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return <div className="workspace-export-page">
    <div className="workspace-export-layout">
      <div className="workspace-export-settings">
        <section className="workspace-export-section" aria-labelledby="export-target-title">
          <header><div><h2 id="export-target-title">{t('workspace.export.targetSection')}</h2><p>{t('workspace.export.targetDescription')}</p></div></header>
          <div className="workspace-export-targets">{PRIMARY_TARGETS.map((target) => {
            const primary = target === activeTarget
            const targetState = stateForTarget(compiles, target)
            return <button type="button" className={primary ? 'is-primary' : ''} aria-pressed={primary} key={target} onClick={() => onSelectTarget?.(target)}>
              <TargetArtwork target={target} />
              <TargetStatus target={target} state={targetState} graphIssues={compiles.graphResult.issues} />
              <span>{primary ? t('workspace.export.primary') : t('workspace.export.selectTarget', { target: getTargetCapabilities(target).label })}</span>
            </button>
          })}</div>
        </section>

        <section className="workspace-export-section" aria-labelledby="export-compatibility-title">
          <header><div><h2 id="export-compatibility-title">{t('workspace.export.compatibilitySection')}</h2><p>{t('workspace.export.compatibilityDescription')}</p></div></header>
          <div className="workspace-export-compatibility">{PRIMARY_TARGETS.map((target) => <article key={target}><TargetArtwork target={target} /><TargetStatus target={target} state={stateForTarget(compiles, target)} graphIssues={compiles.graphResult.issues} /></article>)}</div>
        </section>

        <section className="workspace-export-actions" aria-labelledby="export-actions-title"><div><h2 id="export-actions-title">{t('workspace.export.actionsSection')}</h2><span className={`is-${status.kind}`}>{status.kind === 'ready' ? t('workspace.exportReady') : t('workspace.export.blocked')}</span></div><div><button type="button" className="secondary-action workspace-export-open-preview" onClick={() => onPreview(activeTarget)}><Eye size={16} />{t('workspace.export.preview')}</button><button type="button" className="primary-action workspace-export-mobile-download" disabled={!artifact} onClick={download}><Download size={16} />{t('workspace.export.download')}</button></div></section>

        <section className="workspace-export-section" aria-labelledby="export-configuration-title">
          <header><div><h2 id="export-configuration-title">{t('workspace.export.configurationSection')}</h2><p>{t('workspace.export.configurationDescription')}</p></div></header>
          {activeTarget === 'mihomo'
            ? <div className="export-configuration-grid">
              <div><span><Network size={17} /><strong>{t('workspace.export.network')}</strong></span><label><span>{t('workspace.export.proxyPort')}</span><input type="number" min="1" max="65535" value={mihomoProfile.mixedPort} onChange={(event) => setMihomoProfile({ mixedPort: Number(event.target.value) })} /></label><label className="toggle-row compact"><span><strong>{t('workspace.export.lanAccess')}</strong></span><input type="checkbox" checked={mihomoProfile.allowLan} onChange={(event) => setMihomoProfile({ allowLan: event.target.checked })} /></label></div>
              <div><span><Laptop size={17} /><strong>{t('workspace.export.tun')}</strong></span><label><span>{t('inspector.mihomoPreset')}</span><WebSelect label={t('inspector.mihomoPreset')} value={mihomoProfile.preset} onChange={(value) => setPreset(value as MihomoRuntimePreset)} options={[{ value: 'local-proxy', label: t('inspector.mihomoPreset.local') }, { value: 'desktop-tun', label: t('inspector.mihomoPreset.tun') }]} /></label>{mihomoProfile.preset === 'desktop-tun' && <><label><span>{t('inspector.mihomoTunStack')}</span><WebSelect label={t('inspector.mihomoTunStack')} value={mihomoProfile.tunStack} onChange={(value) => setMihomoProfile({ tunStack: value as MihomoTunStack })} options={[{ value: 'mixed', label: 'Mixed' }, { value: 'system', label: 'System' }, { value: 'gvisor', label: 'gVisor' }]} /></label><label className="toggle-row compact"><span><strong>{t('inspector.mihomoStrictRoute')}</strong><small>{t('inspector.mihomoStrictRouteHint')}</small></span><input type="checkbox" checked={mihomoProfile.strictRoute} onChange={(event) => setMihomoProfile({ strictRoute: event.target.checked })} /></label></>}<small>{mihomoProfile.preset === 'desktop-tun' ? t('inspector.mihomoPreset.tunHint') : t('inspector.mihomoPreset.localHint')}</small></div>
              <div><span><Server size={17} /><strong>{t('workspace.export.dns')}</strong></span><strong>{t('workspace.export.resolvers', { count: dnsResolverCount })}</strong><label><span>{t('inspector.mihomoDnsMode')}</span><WebSelect label={t('inspector.mihomoDnsMode')} value={mihomoProfile.dnsMode} disabled={mihomoProfile.preset === 'desktop-tun'} onChange={(value) => setMihomoProfile({ dnsMode: value as MihomoDnsMode })} options={[{ value: 'disabled', label: t('inspector.mihomoDnsMode.disabled') }, { value: 'redir-host', label: t('inspector.mihomoDnsMode.redir-host') }, { value: 'fake-ip', label: t('inspector.mihomoDnsMode.fake-ip') }]} /></label><small>{mihomoProfile.preset === 'desktop-tun' ? t('inspector.mihomoTunDnsLocked') : t('inspector.mihomoAdvancedHint')}</small></div>
              <details><summary>{t('workspace.export.advanced')}</summary><div>
                <label className="toggle-row compact"><span><strong>{t('inspector.mihomoIpv6')}</strong><small>{t('inspector.mihomoIpv6Hint')}</small></span><input type="checkbox" checked={mihomoProfile.ipv6} onChange={(event) => setMihomoProfile({ ipv6: event.target.checked })} /></label>
                <label className="toggle-row compact"><span><strong>{t('inspector.mihomoSniffer')}</strong><small>{t('inspector.mihomoSnifferHint')}</small></span><input type="checkbox" checked={mihomoProfile.sniffer} onChange={(event) => setMihomoProfile({ sniffer: event.target.checked })} /></label>
                <label className="toggle-row compact"><span><strong>{t('inspector.mihomoStoreSelected')}</strong><small>{t('inspector.mihomoStoreSelectedHint')}</small></span><input type="checkbox" checked={mihomoProfile.storeSelected} onChange={(event) => setMihomoProfile({ storeSelected: event.target.checked })} /></label>
                <label className="toggle-row compact"><span><strong>{t('inspector.mihomoUnifiedDelay')}</strong><small>{t('inspector.mihomoUnifiedDelayHint')}</small></span><input type="checkbox" checked={mihomoProfile.unifiedDelay} onChange={(event) => setMihomoProfile({ unifiedDelay: event.target.checked })} /></label>
                <label className="toggle-row compact"><span><strong>{t('inspector.mihomoTcpConcurrent')}</strong><small>{t('inspector.mihomoTcpConcurrentHint')}</small></span><input type="checkbox" checked={mihomoProfile.tcpConcurrent} onChange={(event) => setMihomoProfile({ tcpConcurrent: event.target.checked })} /></label>
              </div></details>
            </div>
            : <div className="export-target-default"><ShieldCheck size={22} /><div><strong>{t('workspace.export.noTargetSettings')}</strong><p>{t('workspace.export.singBoxDefault')}</p></div></div>}
        </section>
      </div>

      <section className="workspace-export-preview" aria-labelledby="export-inline-preview-title">
        <header><div><span>{activeTarget === 'mihomo' ? 'YAML' : 'JSON'}</span><h2 id="export-inline-preview-title">{t('workspace.export.preview')}</h2></div><div><button type="button" className="secondary-action" disabled={!artifact} onClick={() => void copy()}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? t('preview.copied') : t('preview.copy')}</button><button type="button" className="primary-action" disabled={!artifact} onClick={download}><Download size={15} />{t('workspace.export.download')}</button></div></header>
        <div className="workspace-export-code-toolbar"><code>{artifact?.filename ?? `${activeTarget}.${activeTarget === 'mihomo' ? 'yaml' : 'json'}`}</code><span>{getTargetCapabilities(activeTarget).label}</span></div>
        {artifact
          ? <ConfigCodePreview content={artifact.content} format={activeTarget === 'mihomo' ? 'yaml' : 'json'} label={t('workspace.export.configAria', { format: activeTarget === 'mihomo' ? 'YAML' : 'JSON' })} />
          : <div className="workspace-export-preview-blocked"><AlertTriangle size={22} /><strong>{t('workspace.export.blocked')}</strong>{status.codes.map((code) => <code key={code}>{code}</code>)}</div>}
      </section>
    </div>
  </div>
}

function ConfigCodePreview({ content, format, label }: { content: string; format: 'yaml' | 'json'; label: string }) {
  const lines = content.replace(/\n$/, '').split('\n')
  return <ol className="workspace-export-code" aria-label={label}>{lines.map((line, index) => <li key={`${index}-${line}`}><code>{highlightConfigLine(line, format)}</code></li>)}</ol>
}

function highlightConfigLine(line: string, format: 'yaml' | 'json') {
  const match = format === 'json'
    ? line.match(/^(\s*)("(?:[^"\\]|\\.)+")(\s*:\s*)(.*?)(,?)$/)
    : line.match(/^(\s*)(-\s+)?([^:#][^:]*)(:\s*)(.*)$/)
  if (!match) return line
  if (format === 'json') return <>{match[1]}<span className="token-key">{match[2]}</span>{match[3]}<span className="token-value">{match[4]}</span>{match[5]}</>
  return <>{match[1]}{match[2]}<span className="token-key">{match[3]}</span>{match[4]}<span className="token-value">{match[5]}</span></>
}

function TargetArtwork({ target }: { target: PrimaryTarget }) {
  const definition = outputDefinitions.find((output) => output.target === target)!
  return <AssetIcon className="workspace-target-icon" src={definition.icon} darkSrc={definition.iconDark} fallback={definition.label.slice(0, 1)} />
}

function TargetStatus({ target, state, graphIssues }: { target: PrimaryTarget; state: TargetCompileState; graphIssues: StructuredDiagnostic[] }) {
  const { t } = useI18n()
  const capabilities = getTargetCapabilities(target)
  const status = targetStatus(state, graphIssues)
  const label = status.kind === 'ready'
    ? t('workspace.targetReady')
    : status.kind === 'loading'
      ? t('workspace.targetChecking')
      : t('workspace.targetBlockers', { count: status.errorCount || 1 })
  return <div className="workspace-target-status">
    <span><strong>{capabilities.label}</strong><small>{t('newProject.baseline', { version: capabilities.baselineVersion })}</small></span>
    <b className={`is-${status.kind}`}>{status.kind === 'loading' ? <LoaderCircle className="spin" size={13} /> : status.kind === 'ready' ? <Check size={13} /> : <AlertTriangle size={13} />}{label}</b>
    {state.result?.stats && <small>{t('workspace.export.nodes', { count: state.result.stats.endpointCount ?? state.result.stats.proxyCount })}</small>}
    {status.warningCount > 0 && <small>{t(status.warningCount === 1 ? 'workspace.targetWarning' : 'workspace.targetWarnings', { count: status.warningCount })}</small>}
    {status.codes.length > 0 && <div>{status.codes.map((code) => <code key={code}>{code}</code>)}</div>}
  </div>
}

export function stateForTarget(compiles: ProjectCompiles, target: PrimaryTarget) {
  return target === 'mihomo' ? compiles.mihomoState : compiles.singBoxState
}

export function targetStatus(state: TargetCompileState, graphIssues: StructuredDiagnostic[]) {
  const graphErrors = graphIssues.filter((issue) => issue.severity === 'error')
  const issues = graphErrors.length ? graphErrors : state.result?.issues ?? []
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')
  const codes = [...new Set(errors.map((issue) => issue.code))].slice(0, 3)
  if (graphErrors.length || state.status === 'error' || state.status === 'unavailable') return {
    kind: 'blocked' as const,
    errorCount: errors.length,
    warningCount: warnings.length,
    codes,
  }
  if (state.status === 'success') return {
    kind: 'ready' as const,
    errorCount: 0,
    warningCount: warnings.length,
    codes: [] as string[],
  }
  return { kind: 'loading' as const, errorCount: 0, warningCount: 0, codes: [] as string[] }
}
