import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Clipboard, Download, Laptop, LoaderCircle, Network, Server, Settings2, ShieldCheck, X } from 'lucide-react'
import {
  getTargetCapabilities, PRODUCT_TARGETS, resolveActiveProductTarget, type PrimaryTarget,
} from '../../core/capabilities'
import { deduplicateDiagnostics, type CompileResult, type StructuredDiagnostic } from '../../core/compiler'
import { outputDefinitions } from '../../data/demoProject'
import { localizeNodeTitle, useI18n } from '../../i18n'
import type { useProjectCompiles } from '../compiler/useProjectCompiles'
import type { TargetCompileState } from '../compiler/useTargetCompile'
import { presentDiagnostics, summarizeDiagnosticCounts } from '../compiler/diagnosticPresentation'
import { AssetIcon } from '../icons/AssetIcon'
import { useBuilderStore } from '../../store/useBuilderStore'
import { createMihomoOutputProfile, resolveMihomoOutputProfile } from '../../targets/mihomo/profile'
import { isMihomoTargetSettingManaged, resolveMihomoTargetSettingsDisplay, type MihomoTargetSettingsField, type MihomoTargetSettingsPatch } from '../../targets/mihomo/settings'
import type { MihomoDnsMode, MihomoOutputProfile, MihomoRuntimePreset, MihomoTargetSettings, MihomoTunStack } from '../../types/project'
import { buildTargetExportArtifact, targetFileMeta, type TargetExportFormat } from '../compiler/exportFile'
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
  const [candidate, setCandidate] = useState<PrimaryTarget>(() => resolveActiveProductTarget(current))
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    setCandidate(resolveActiveProductTarget(current))
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
  const activeTarget = resolveActiveProductTarget(current)

  return <div className="target-switch-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={panelRef} className="target-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="target-switch-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>{t('workspace.primaryTarget')}</span><h2 id="target-switch-title">{t('workspace.switchTarget')}</h2></div><button ref={closeRef} type="button" aria-label={t('workspace.closeTargetSwitch')} onClick={onClose}><X size={18} /></button></header>
      <p>{t('workspace.switchTargetDescription')}</p>
      {current && getTargetCapabilities(current).productStatus === 'paused' && <aside className="target-product-paused" role="status"><AlertTriangle size={16} /><span><strong>{t('workspace.targetPausedTitle', { target: getTargetCapabilities(current).label })}</strong>{t('workspace.targetPausedDescription')}</span></aside>}
      <div className="target-switch-options">{PRODUCT_TARGETS.map((target) => <button type="button" className={candidate === target ? 'is-selected' : ''} aria-pressed={candidate === target} key={target} onClick={() => setCandidate(target)}>
        <TargetArtwork target={target} />
        <TargetStatus target={target} state={stateForTarget(compiles, target)} active={target === activeTarget} graphIssues={target === activeTarget ? compiles.graphResult.issues : []} />
        <i>{candidate === target ? t('newProject.selected') : t('newProject.select')}</i>
      </button>)}</div>
      <aside><ShieldCheck size={16} /><span>{t('workspace.switchTargetPreserves')}</span></aside>
      <footer><button type="button" className="secondary-action" onClick={onClose}>{t('preview.close')}</button><button type="button" className="primary-action" onClick={() => onSelect(candidate)}>{candidate === current ? t('workspace.keepTarget') : t('workspace.useTarget', { target: getTargetCapabilities(candidate).label })}</button></footer>
    </section>
  </div>
}

export function WorkspaceExportPanel({ primaryTarget, compiles, onSelectTarget, onShowDiagnostics }: {
  primaryTarget: PrimaryTarget | null
  compiles: ProjectCompiles
  onSelectTarget?: (target: PrimaryTarget) => void
  onShowDiagnostics?: () => void
}) {
  const { locale, t } = useI18n()
  const projectName = useBuilderStore((state) => state.projectName)
  const nodes = useBuilderStore((state) => state.nodes)
  const updateNodeData = useBuilderStore((state) => state.updateNodeData)
  const targetSettings = useBuilderStore((state) => state.targetSettings)
  const updateMihomoTargetSettings = useBuilderStore((state) => state.updateMihomoTargetSettings)
  const setToast = useBuilderStore((state) => state.setToast)
  const [copied, setCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeTarget: PrimaryTarget = resolveActiveProductTarget(primaryTarget)
  const pausedTarget = primaryTarget && getTargetCapabilities(primaryTarget).productStatus === 'paused'
  const output = nodes.find((node) => node.data.blockType === 'output' && !node.data.disabled)
  const mihomoProfile = resolveMihomoOutputProfile(output?.data.mihomoProfile)
  const dnsResolverCount = nodes.filter((node) => node.data.blockType === 'dns' && !node.data.disabled)
    .reduce((count, node) => count + countEnabledDnsResolvers(node.data.dnsResolvers, node.data.resolver), 0)
  const state = stateForTarget(compiles, activeTarget)
  const status = targetStatus(state, compiles.graphResult.issues, true)
  const hasSurgeTargetProjection = state.result?.targetProjection?.target === 'surge'
  const displayedIssues = activeTarget === 'surge' && hasSurgeTargetProjection
    ? status.issues.filter((issue) => issue.code !== 'SURGE_PROXY_SET_ENDPOINTS_SKIPPED')
    : status.issues
  const entityNames = new Map(nodes.map((node) => [node.id, localizeNodeTitle(node, locale)]))
  const artifact = buildTargetExportArtifact(projectName, activeTarget, state.result)
  const fileMeta = targetFileMeta[activeTarget]
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

  const capabilities = getTargetCapabilities(activeTarget)
  const hasTargetSettings = activeTarget === 'mihomo'
  const readyArtifact = status.kind === 'ready' ? artifact : undefined
  const exportable = Boolean(readyArtifact)

  useEffect(() => {
    setSettingsOpen(false)
  }, [activeTarget])

  return <div className="workspace-export-page">
    {pausedTarget && <div className="workspace-target-paused" role="status"><AlertTriangle size={20} /><div><strong>{t('workspace.targetPausedTitle', { target: getTargetCapabilities(primaryTarget).label })}</strong><p>{t('workspace.targetPausedDescription')}</p></div>{onSelectTarget && <button type="button" className="primary-action" onClick={() => onSelectTarget('mihomo')}>{t('workspace.useTarget', { target: getTargetCapabilities('mihomo').label })}</button>}</div>}
    <div className="workspace-output-boundary">
      <div className="workspace-output-boundary-copy">
        <span>{t('workspace.export.boundaryLabel')}</span>
        <p>{t('workspace.export.boundaryDescription')}</p>
      </div>
      <nav className="workspace-output-flow" aria-label={t('workspace.export.flowLabel')}>
        <span><b>1</b>{t('workspace.export.stepTarget')}</span>
        <i aria-hidden="true">→</i>
        <span><b>2</b>{t('workspace.export.stepCompatibility')}</span>
        <i aria-hidden="true">→</i>
        <span><b>3</b>{t('workspace.export.stepSettings')}</span>
        <i aria-hidden="true">→</i>
        <span><b>4</b>{t('workspace.export.stepExport')}</span>
      </nav>
    </div>
    <div className={`workspace-export-layout${settingsOpen && hasTargetSettings ? ' is-settings-open' : ''}`}>
      <aside className="workspace-export-sidebar" aria-labelledby="export-target-title">
        <header><h2 id="export-target-title">{t('workspace.export.targetsHeading')}</h2><p>{t('workspace.export.targetsDescription')}</p></header>
        <nav id="export-target-list" className="workspace-export-target-list" aria-label={t('workspace.export.targetsHeading')}>
          {PRODUCT_TARGETS.map((target) => {
            const selected = target === activeTarget
            const targetState = stateForTarget(compiles, target)
            const targetStateStatus = targetStatus(targetState, selected ? compiles.graphResult.issues : [], selected)
            return <button type="button" className={`workspace-export-target-item${selected ? ' is-selected' : ''}`} aria-pressed={selected} key={target} onClick={() => onSelectTarget?.(target)}>
              <TargetArtwork target={target} />
              <span><strong>{getTargetCapabilities(target).label}</strong><CompactTargetStatus status={targetStateStatus} /></span>
              {selected && <Check className="workspace-export-target-selected" size={16} aria-hidden="true" />}
            </button>
          })}
        </nav>
      </aside>

      <div className="workspace-export-main">
        <section className={`workspace-export-preview is-${status.kind}`} aria-labelledby="export-inline-preview-title">
          <header>
            <div className="workspace-export-preview-target">
              <TargetArtwork target={activeTarget} />
              <div><h2 id="export-inline-preview-title">{capabilities.label}</h2><strong>{exportStatusSummary(status, t)}</strong><small>{targetBaselineDescription(activeTarget, capabilities.baselineVersion, t)}</small></div>
            </div>
            <div className="workspace-export-preview-actions">
              {hasTargetSettings && <button type="button" className="secondary-action workspace-export-settings-trigger" aria-expanded={settingsOpen} aria-controls="workspace-export-settings-drawer" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={15} />{t('workspace.export.settings')}</button>}
              <button type="button" className="secondary-action" disabled={!exportable} title={!exportable ? t('workspace.export.blockedReason') : undefined} onClick={() => void copy()}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? t('preview.copied') : t('preview.copy')}</button>
              <button type="button" className="primary-action" disabled={!exportable} title={!exportable ? t('workspace.export.blockedReason') : undefined} onClick={download}><Download size={16} />{t('workspace.export.download')}</button>
            </div>
          </header>
          {readyArtifact
            ? <div className="workspace-export-preview-body"><div className="workspace-export-code-toolbar"><code>{readyArtifact.filename}</code><span>{capabilities.label}</span></div><ConfigCodePreview content={readyArtifact.content} format={fileMeta.format} label={t('workspace.export.configAria', { format: fileMeta.format.toUpperCase() })} /></div>
            : status.kind === 'blocked'
              ? <BlockedExportPreview target={activeTarget} issues={displayedIssues} entityNames={entityNames} targetProjection={state.result?.targetProjection} onShowDiagnostics={onShowDiagnostics} />
              : <ExportCheckingState />}
        </section>

      </div>
      {settingsOpen && hasTargetSettings && <>
        <div className="workspace-export-settings-backdrop" aria-hidden="true" onMouseDown={() => setSettingsOpen(false)} />
        <MihomoSettingsDrawer targetLabel={capabilities.label} profile={mihomoProfile} managedSettings={targetSettings?.mihomo} dnsResolverCount={dnsResolverCount} onChange={setMihomoProfile} onManagedChange={updateMihomoTargetSettings} onManagedReset={(field) => updateMihomoTargetSettings({ [field]: undefined })} onPresetChange={setPreset} onClose={() => setSettingsOpen(false)} />
      </>}
    </div>
  </div>
}

export function MihomoSettingsDrawer({ targetLabel, profile, managedSettings, dnsResolverCount, onChange, onManagedChange, onManagedReset, onPresetChange, onClose }: {
  targetLabel: string
  profile: MihomoOutputProfile
  managedSettings?: MihomoTargetSettings
  dnsResolverCount: number
  onChange: (patch: Partial<MihomoOutputProfile>) => void
  onManagedChange: (patch: MihomoTargetSettingsPatch) => void
  onManagedReset: (field: MihomoTargetSettingsField) => void
  onPresetChange: (preset: MihomoRuntimePreset) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [mixedPortError, setMixedPortError] = useState(false)
  const displaySettings = resolveMihomoTargetSettingsDisplay(managedSettings, {
    mixedPort: profile.mixedPort,
    allowLan: profile.allowLan,
    ipv6: profile.ipv6,
  })
  const displayProfile = { ...profile, ...displaySettings }
  const managed = (field: MihomoTargetSettingsField) => isMihomoTargetSettingManaged(managedSettings, field)
  const resetManaged = (field: MihomoTargetSettingsField) => {
    if (field === 'mixedPort') setMixedPortError(false)
    onManagedReset(field)
  }
  const updateMixedPort = (raw: string) => {
    const value = Number(raw)
    if (Number.isInteger(value) && value >= 1 && value <= 65_535) {
      setMixedPortError(false)
      onManagedChange({ mixedPort: value })
    } else {
      setMixedPortError(true)
    }
  }
  return <aside id="workspace-export-settings-drawer" className="workspace-export-settings-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-export-settings-title">
    <header>
      <h2 id="workspace-export-settings-title">{t('workspace.export.targetSettings', { target: targetLabel })}</h2>
      <button type="button" className="icon-button" aria-label={t('workspace.export.closeSettings')} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="workspace-export-settings-scroll">
      <details className="workspace-export-settings-section" open>
        <summary><span><Network size={17} /><strong>{t('workspace.export.network')}</strong></span><ChevronDown size={17} /></summary>
        <div className="workspace-export-settings-section-body">
          <label><span>{t('workspace.export.proxyPort')}</span><input type="number" min="1" max="65535" step="1" value={displayProfile.mixedPort} aria-invalid={mixedPortError} onChange={(event) => updateMixedPort(event.target.value)} />{mixedPortError && <small className="workspace-export-settings-error">{t('workspace.export.mixedPortInvalid')}</small>}<button type="button" className="row-action workspace-export-settings-reset" disabled={!managed('mixedPort')} onClick={() => resetManaged('mixedPort')}>{t('workspace.export.useInherited')}</button></label>
          <label className="toggle-row compact"><span><strong>{t('workspace.export.lanAccess')}</strong></span><input type="checkbox" checked={displayProfile.allowLan} onChange={(event) => onManagedChange({ allowLan: event.target.checked })} /></label>
          <button type="button" className="row-action workspace-export-settings-reset" disabled={!managed('allowLan')} onClick={() => resetManaged('allowLan')}>{t('workspace.export.useInherited')}</button>
        </div>
      </details>

      <details className="workspace-export-settings-section" open>
        <summary><span><Laptop size={17} /><strong>{t('workspace.export.tun')}</strong></span><ChevronDown size={17} /></summary>
        <div className="workspace-export-settings-section-body">
          <label><span>{t('inspector.mihomoPreset')}</span><WebSelect label={t('inspector.mihomoPreset')} value={profile.preset} onChange={(value) => onPresetChange(value as MihomoRuntimePreset)} options={[{ value: 'local-proxy', label: t('inspector.mihomoPreset.local') }, { value: 'desktop-tun', label: t('inspector.mihomoPreset.tun') }]} /></label>
          {profile.preset === 'desktop-tun' && <>
            <label><span>{t('inspector.mihomoTunStack')}</span><WebSelect label={t('inspector.mihomoTunStack')} value={profile.tunStack} onChange={(value) => onChange({ tunStack: value as MihomoTunStack })} options={[{ value: 'mixed', label: 'Mixed' }, { value: 'system', label: 'System' }, { value: 'gvisor', label: 'gVisor' }]} /></label>
            <label className="toggle-row compact"><span><strong>{t('inspector.mihomoStrictRoute')}</strong><small>{t('inspector.mihomoStrictRouteHint')}</small></span><input type="checkbox" checked={profile.strictRoute} onChange={(event) => onChange({ strictRoute: event.target.checked })} /></label>
          </>}
          <small>{profile.preset === 'desktop-tun' ? t('inspector.mihomoPreset.tunHint') : t('inspector.mihomoPreset.localHint')}</small>
        </div>
      </details>

      <details className="workspace-export-settings-section" open>
        <summary><span><Server size={17} /><strong>{t('workspace.export.dns')}</strong></span><ChevronDown size={17} /></summary>
        <div className="workspace-export-settings-section-body">
          <strong>{t('workspace.export.resolvers', { count: dnsResolverCount })}</strong>
          <label><span>{t('inspector.mihomoDnsMode')}</span><WebSelect label={t('inspector.mihomoDnsMode')} value={profile.dnsMode} disabled={profile.preset === 'desktop-tun'} onChange={(value) => onChange({ dnsMode: value as MihomoDnsMode })} options={[{ value: 'disabled', label: t('inspector.mihomoDnsMode.disabled') }, { value: 'redir-host', label: t('inspector.mihomoDnsMode.redir-host') }, { value: 'fake-ip', label: t('inspector.mihomoDnsMode.fake-ip') }]} /></label>
          <small>{profile.preset === 'desktop-tun' ? t('inspector.mihomoTunDnsLocked') : t('inspector.mihomoAdvancedHint')}</small>
        </div>
      </details>

      <details className="workspace-export-settings-section">
        <summary><span><Settings2 size={17} /><strong>{t('workspace.export.advanced')}</strong></span><ChevronDown size={17} /></summary>
        <div className="workspace-export-settings-section-body">
          <label className="toggle-row compact"><span><strong>{t('inspector.mihomoIpv6')}</strong><small>{t('inspector.mihomoIpv6Hint')}</small></span><input type="checkbox" checked={displayProfile.ipv6} onChange={(event) => onManagedChange({ ipv6: event.target.checked })} /></label>
          <button type="button" className="row-action workspace-export-settings-reset" disabled={!managed('ipv6')} onClick={() => resetManaged('ipv6')}>{t('workspace.export.useInherited')}</button>
          <label className="toggle-row compact"><span><strong>{t('inspector.mihomoSniffer')}</strong><small>{t('inspector.mihomoSnifferHint')}</small></span><input type="checkbox" checked={profile.sniffer} onChange={(event) => onChange({ sniffer: event.target.checked })} /></label>
          <label className="toggle-row compact"><span><strong>{t('inspector.mihomoStoreSelected')}</strong><small>{t('inspector.mihomoStoreSelectedHint')}</small></span><input type="checkbox" checked={profile.storeSelected} onChange={(event) => onChange({ storeSelected: event.target.checked })} /></label>
          <label className="toggle-row compact"><span><strong>{t('inspector.mihomoUnifiedDelay')}</strong><small>{t('inspector.mihomoUnifiedDelayHint')}</small></span><input type="checkbox" checked={profile.unifiedDelay} onChange={(event) => onChange({ unifiedDelay: event.target.checked })} /></label>
          <label className="toggle-row compact"><span><strong>{t('inspector.mihomoTcpConcurrent')}</strong><small>{t('inspector.mihomoTcpConcurrentHint')}</small></span><input type="checkbox" checked={profile.tcpConcurrent} onChange={(event) => onChange({ tcpConcurrent: event.target.checked })} /></label>
        </div>
      </details>
    </div>
  </aside>
}

function targetBaselineDescription(target: PrimaryTarget, baselineVersion: string, t: ReturnType<typeof useI18n>['t']) {
  const description = target === 'surge'
    ? t('newProject.targetDescription.surge')
    : target === 'loon'
      ? t('workspace.export.loonDefault')
      : target === 'shadowrocket'
        ? t('newProject.targetDescription.shadowrocket')
        : t('workspace.export.mihomoDefault')
  const baseline = target === 'shadowrocket'
    ? t('workspace.export.testedClientBaseline', { version: baselineVersion })
    : t('workspace.export.minimumVersion', { version: baselineVersion })
  return `${description}${description.endsWith('。') ? '' : ' '}${baseline}`
}

function CompactTargetStatus({ status }: { status: ReturnType<typeof targetStatus> }) {
  const { t } = useI18n()
  let label = t('workspace.export.targetListReadyNoCount')
  if (status.kind === 'blocked') label = `${blockerSummary(status.errorCount || 1, t)} · ${warningSummary(status.warningCount, t)}`
  else if (status.kind === 'loading') label = t('workspace.export.targetListChecking')
  else if (status.kind === 'available') label = t('workspace.export.targetListAvailable')
  return <small className={`workspace-export-target-summary is-${status.kind}`}>{label}</small>
}

function exportStatusSummary(status: ReturnType<typeof targetStatus>, t: ReturnType<typeof useI18n>['t']) {
  if (status.kind === 'loading') return t('workspace.export.checkingTitle')
  const warnings = warningSummary(status.warningCount, t)
  if (status.kind === 'blocked') return `${t('workspace.export.unavailable')} · ${blockerSummary(status.errorCount || 1, t)} · ${warnings}`
  return status.warningCount > 0 ? `${t('workspace.exportReady')} · ${warnings}` : t('workspace.exportReady')
}

function blockerSummary(count: number, t: ReturnType<typeof useI18n>['t']) {
  return count === 1 ? t('status.oneBlocker') : t('status.blockers', { count })
}

function warningSummary(count: number, t: ReturnType<typeof useI18n>['t']) {
  return count === 1 ? t('status.oneWarning') : t('status.warnings', { count })
}

function ExportCheckingState() {
  const { t } = useI18n()
  return <div className="workspace-export-preview-checking" role="status"><LoaderCircle className="spin" size={24} /><strong>{t('workspace.export.checkingTitle')}</strong><p>{t('workspace.export.checkingDescription')}</p></div>
}

function BlockedExportPreview({ target, issues, entityNames, targetProjection, onShowDiagnostics }: {
  target: PrimaryTarget
  issues: StructuredDiagnostic[]
  entityNames: ReadonlyMap<string, string>
  targetProjection?: CompileResult['targetProjection']
  onShowDiagnostics?: () => void
}) {
  const { t, locale } = useI18n()
  const blocking = issues.filter((issue) => issue.severity === 'error')
  const summaries = presentDiagnostics(blocking, { locale, t, exportable: false, entityNames, targetProjection })
    .filter((summary, index, all) => all.findIndex((candidate) => candidate.title === summary.title && candidate.description === summary.description) === index)
    .slice(0, 3)
  return <div className="workspace-export-preview-blocked-state" role="status">
    <AlertTriangle size={26} />
    <strong>{t('workspace.export.blockedPreviewTitle', { target: getTargetCapabilities(target).label })}</strong>
    {summaries.length > 0 && <div className="workspace-export-blocked-summaries"><span>{t('workspace.export.blockedPreviewMainIssues')}</span><ul>{summaries.map((summary) => <li key={summary.key}><strong>{summary.title}</strong><small>{summary.description}</small></li>)}</ul></div>}
    {onShowDiagnostics && <button type="button" className="secondary-action" onClick={onShowDiagnostics}>{t('workspace.export.viewAllIssues')}</button>}
    <small>{t('workspace.export.blockedReason')}</small>
  </div>
}

function ConfigCodePreview({ content, format, label }: { content: string; format: TargetExportFormat; label: string }) {
  const lines = content.replace(/\n$/, '').split('\n')
  return <ol className="workspace-export-code" aria-label={label}>{lines.map((line, index) => <li key={`${index}-${line}`}><code>{highlightConfigLine(line, format)}</code></li>)}</ol>
}

function highlightConfigLine(line: string, format: TargetExportFormat) {
  if (format === 'ini') {
    const section = line.match(/^(\[[^\]]+\])$/)
    if (section) return <span className="token-section">{section[1]}</span>
    const assignment = line.match(/^([^=]+?)(\s*=\s*)(.*)$/)
    if (assignment) return <><span className="token-key">{assignment[1]}</span>{assignment[2]}<span className="token-value">{assignment[3]}</span></>
    return line
  }
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

function TargetStatus({ target, state, active, graphIssues }: { target: PrimaryTarget; state: TargetCompileState; active: boolean; graphIssues: StructuredDiagnostic[] }) {
  const { t } = useI18n()
  const capabilities = getTargetCapabilities(target)
  const status = targetStatus(state, graphIssues, active)
  const compatibleNodeCount = target === 'surge'
    ? state.result?.stats?.compatibleEndpointCount ?? state.result?.stats?.endpointCount ?? state.result?.stats?.proxyCount
    : state.result?.stats?.endpointCount ?? state.result?.stats?.proxyCount
  const label = status.kind === 'ready'
    ? t('workspace.targetReady')
    : status.kind === 'loading'
      ? t('workspace.targetChecking')
      : status.kind === 'available'
        ? t('workspace.targetAvailable')
        : t('workspace.targetBlockers', { count: status.errorCount || 1 })
  return <div className="workspace-target-status">
    <span><strong>{capabilities.label}</strong><small>{t('newProject.baseline', { version: capabilities.baselineVersion })}</small>{target === 'surge' && <small>{t('newProject.targetDescription.surge')}</small>}{target === 'shadowrocket' && <small>{t('newProject.targetDescription.shadowrocket')}</small>}</span>
    <b className={`is-${status.kind}`}>{status.kind === 'loading' ? <LoaderCircle className="spin" size={13} /> : status.kind === 'ready' ? <Check size={13} /> : status.kind === 'blocked' ? <AlertTriangle size={13} /> : null}{label}</b>
    {status.kind === 'available' && <small>{t('workspace.targetCheckAfterSwitching')}</small>}
    {status.kind !== 'available' && compatibleNodeCount !== undefined && <small>{t('workspace.targetCompatibilitySummary', { compatible: compatibleNodeCount, blockers: status.errorCount, warnings: status.warningCount })}</small>}
  </div>
}

export function stateForTarget(compiles: ProjectCompiles, target: PrimaryTarget) {
  return target === 'mihomo'
    ? compiles.mihomoState
    : target === 'surge' ? compiles.surgeState : target === 'sing-box' ? compiles.singBoxState : target === 'loon' ? compiles.loonState : compiles.shadowrocketState
}

export function targetStatus(state: TargetCompileState, graphIssues: StructuredDiagnostic[], active: boolean) {
  if (!active) return {
    kind: 'available' as const,
    errorCount: 0,
    warningCount: 0,
    issues: [] as StructuredDiagnostic[],
  }
  const graphErrors = graphIssues.filter((issue) => issue.severity === 'error')
  const issues = graphErrors.length
    ? graphIssues
    : deduplicateDiagnostics([...graphIssues, ...(state.result?.issues ?? [])])
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warningCount = summarizeDiagnosticCounts(issues).warningGroupCount
  if (graphErrors.length || state.status === 'error' || state.status === 'unavailable') return {
    kind: 'blocked' as const,
    errorCount: errors.length,
    warningCount,
    issues,
  }
  if (state.status === 'success') return {
    kind: 'ready' as const,
    errorCount: 0,
    warningCount,
    issues,
  }
  return { kind: 'loading' as const, errorCount: 0, warningCount: 0, issues }
}
