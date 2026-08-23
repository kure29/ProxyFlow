import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleDashed, FileInput, Link2, Plus, X } from 'lucide-react'
import { PRODUCT_TARGETS, getTargetCapabilities, type PrimaryTarget } from '../../core/capabilities'
import { outputDefinitions } from '../../data/demoProject'
import { useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { AssetIcon } from '../icons/AssetIcon'
import { sourceBlockForNewProject, type NewProjectSourceChoice } from './newProjectFlow'
import {
  countProjectNameGraphemes, PROJECT_NAME_MAX_GRAPHEMES, validateProjectName,
} from '../../core/project/projectName'

interface NewProjectDialogProps {
  open: boolean
  required?: boolean
  configureExistingProject?: boolean
  onClose: () => void
  beforeCreate: () => Promise<void>
  onComplete: () => void
}

export function NewProjectDialog({ open, required = false, configureExistingProject = false, onClose, beforeCreate, onComplete }: NewProjectDialogProps) {
  const { t } = useI18n()
  const createNewProject = useBuilderStore((state) => state.createNewProject)
  const setPrimaryTarget = useBuilderStore((state) => state.setPrimaryTarget)
  const addLibraryNode = useBuilderStore((state) => state.addLibraryNode)
  const [step, setStep] = useState<1 | 2>(1)
  const [target, setTarget] = useState<PrimaryTarget>('mihomo')
  const [source, setSource] = useState<NewProjectSourceChoice>('url')
  const [projectName, setProjectName] = useState(() => t('project.blankName'))
  const [creating, setCreating] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    setStep(1)
    setProjectName(t('project.blankName'))
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    window.setTimeout(() => headingRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !required) onCloseRef.current()
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === headingRef.current || !dialogRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
      window.requestAnimationFrame(() => {
        const previousTarget = returnFocusRef.current
        if (previousTarget?.isConnected && previousTarget !== document.body && previousTarget !== document.documentElement) {
          previousTarget.focus()
          return
        }
        const persistentProjectTrigger = Array.from(document.querySelectorAll<HTMLElement>('.project-manager header button, .brand'))
          .find((element) => element.getClientRects().length > 0)
        persistentProjectTrigger?.focus()
      })
    }
  }, [open, required, t])

  if (!open) return null

  const finishExistingProject = () => {
    setPrimaryTarget(target)
    onComplete()
  }
  const create = async () => {
    if (creating) return
    setCreating(true)
    try {
      await beforeCreate()
      createNewProject(target, projectName)
      const blockType = sourceBlockForNewProject(source)
      if (blockType) addLibraryNode(blockType, { x: 80, y: 90 })
      onComplete()
    } finally {
      setCreating(false)
    }
  }

  return <div className="new-project-backdrop">
    <section ref={dialogRef} className="new-project-dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <header>
        <div>
          <span>{configureExistingProject ? t('newProject.required') : t('newProject.step', { current: step, total: 2 })}</span>
          <h2 id="new-project-title" ref={headingRef} tabIndex={-1}>{configureExistingProject ? t('newProject.chooseExistingTitle') : step === 1 ? t('newProject.chooseTargetTitle') : t('newProject.addSourceTitle')}</h2>
        </div>
        {!required && <button type="button" onClick={onClose} aria-label={t('newProject.close')}><X size={18} /></button>}
      </header>

      {step === 1 ? <div className="new-project-target-step">
        {!configureExistingProject && <label className="new-project-name-field" htmlFor="new-project-name">
          <span>{t('project.name')}</span>
          <input id="new-project-name" value={projectName} aria-invalid={validateProjectName(projectName) !== 'valid'} aria-describedby="new-project-name-help" onChange={(event) => setProjectName(event.target.value)} />
          <small id="new-project-name-help"><span>{t('project.nameLimit', { count: PROJECT_NAME_MAX_GRAPHEMES })}</span><span>{countProjectNameGraphemes(projectName)} / {PROJECT_NAME_MAX_GRAPHEMES}</span></small>
        </label>}
        <div className="target-choice-list">
          {PRODUCT_TARGETS.map((item) => {
            const definition = outputDefinitions.find((output) => output.target === item)!
            const capabilities = getTargetCapabilities(item)
            return <button type="button" className={target === item ? 'is-selected' : ''} key={item} onClick={() => setTarget(item)} aria-pressed={target === item}>
              <AssetIcon className="target-choice-icon" src={definition.icon} darkSrc={definition.iconDark} fallback={definition.label.slice(0, 1)} />
              <span><strong>{definition.label}</strong><small>{t('newProject.baseline', { version: capabilities.baselineVersion })}</small></span>
              <i>{target === item ? t('newProject.selected') : t('newProject.select')}</i>
            </button>
          })}
        </div>
      </div> : <div className="source-choice-list">
        <SourceChoice icon={<Link2 size={19} />} label={t('newProject.source.url')} selected={source === 'url'} onClick={() => setSource('url')} />
        <SourceChoice icon={<Plus size={19} />} label={t('newProject.source.paste')} selected={source === 'paste'} onClick={() => setSource('paste')} />
        <SourceChoice icon={<FileInput size={19} />} label={t('newProject.source.file')} selected={source === 'file'} onClick={() => setSource('file')} />
        <SourceChoice icon={<CircleDashed size={19} />} label={t('newProject.source.empty')} selected={source === 'empty'} onClick={() => setSource('empty')} />
      </div>}

      <footer>
        {step === 2 && <button type="button" className="secondary-action" onClick={() => setStep(1)}><ArrowLeft size={15} />{t('newProject.back')}</button>}
        <span />
        {configureExistingProject
          ? <button type="button" className="primary-action" onClick={finishExistingProject}>{t('newProject.useTarget')}<ArrowRight size={15} /></button>
          : step === 1
            ? <button type="button" className="primary-action" disabled={validateProjectName(projectName) !== 'valid'} onClick={() => setStep(2)}>{t('newProject.continue')}<ArrowRight size={15} /></button>
            : <button type="button" className="primary-action" disabled={creating} onClick={() => void create()}>{t('newProject.create')}<ArrowRight size={15} /></button>}
      </footer>
    </section>
  </div>
}

function SourceChoice({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" className={selected ? 'is-selected' : ''} onClick={onClick} aria-pressed={selected}>
    <span>{icon}</span><strong>{label}</strong>
  </button>
}
