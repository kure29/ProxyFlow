import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleDashed, FileInput, Link2, Plus, X } from 'lucide-react'
import { PRIMARY_TARGETS, getTargetCapabilities, type PrimaryTarget } from '../../core/capabilities'
import { outputDefinitions } from '../../data/demoProject'
import { useI18n } from '../../i18n'
import { useBuilderStore } from '../../store/useBuilderStore'
import { AssetIcon } from '../icons/AssetIcon'
import { sourceBlockForNewProject, type NewProjectSourceChoice } from './newProjectFlow'

interface NewProjectDialogProps {
  open: boolean
  required?: boolean
  onClose: () => void
  onComplete: () => void
}

export function NewProjectDialog({ open, required = false, onClose, onComplete }: NewProjectDialogProps) {
  const { t } = useI18n()
  const createNewProject = useBuilderStore((state) => state.createNewProject)
  const setPrimaryTarget = useBuilderStore((state) => state.setPrimaryTarget)
  const addLibraryNode = useBuilderStore((state) => state.addLibraryNode)
  const [step, setStep] = useState<1 | 2>(1)
  const [target, setTarget] = useState<PrimaryTarget>('mihomo')
  const [source, setSource] = useState<NewProjectSourceChoice>('url')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    setStep(1)
    window.setTimeout(() => headingRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !required) onClose()
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
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, required])

  if (!open) return null

  const finishExistingProject = () => {
    setPrimaryTarget(target)
    onComplete()
  }
  const create = () => {
    createNewProject(target)
    const blockType = sourceBlockForNewProject(source)
    if (blockType) addLibraryNode(blockType, { x: 80, y: 90 })
    onComplete()
  }

  return <div className="new-project-backdrop">
    <section ref={dialogRef} className="new-project-dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <header>
        <div>
          <span>{required ? t('newProject.required') : t('newProject.step', { current: step, total: 2 })}</span>
          <h2 id="new-project-title" ref={headingRef} tabIndex={-1}>{required ? t('newProject.chooseExistingTitle') : step === 1 ? t('newProject.chooseTargetTitle') : t('newProject.addSourceTitle')}</h2>
        </div>
        {!required && <button type="button" onClick={onClose} aria-label={t('newProject.close')}><X size={18} /></button>}
      </header>

      {step === 1 ? <div className="target-choice-list">
        {PRIMARY_TARGETS.map((item) => {
          const definition = outputDefinitions.find((output) => output.target === item)!
          const capabilities = getTargetCapabilities(item)
          return <button type="button" className={target === item ? 'is-selected' : ''} key={item} onClick={() => setTarget(item)} aria-pressed={target === item}>
            <AssetIcon className="target-choice-icon" src={definition.icon} darkSrc={definition.iconDark} fallback={definition.label.slice(0, 1)} />
            <span><strong>{definition.label}</strong><small>{t('newProject.baseline', { version: capabilities.baselineVersion })}</small></span>
            <i>{target === item ? t('newProject.selected') : t('newProject.select')}</i>
          </button>
        })}
      </div> : <div className="source-choice-list">
        <SourceChoice icon={<Link2 size={19} />} label={t('newProject.source.url')} selected={source === 'url'} onClick={() => setSource('url')} />
        <SourceChoice icon={<Plus size={19} />} label={t('newProject.source.paste')} selected={source === 'paste'} onClick={() => setSource('paste')} />
        <SourceChoice icon={<FileInput size={19} />} label={t('newProject.source.file')} selected={source === 'file'} onClick={() => setSource('file')} />
        <SourceChoice icon={<CircleDashed size={19} />} label={t('newProject.source.empty')} selected={source === 'empty'} onClick={() => setSource('empty')} />
      </div>}

      <footer>
        {step === 2 && <button type="button" className="secondary-action" onClick={() => setStep(1)}><ArrowLeft size={15} />{t('newProject.back')}</button>}
        <span />
        {required
          ? <button type="button" className="primary-action" onClick={finishExistingProject}>{t('newProject.useTarget')}<ArrowRight size={15} /></button>
          : step === 1
            ? <button type="button" className="primary-action" onClick={() => setStep(2)}>{t('newProject.continue')}<ArrowRight size={15} /></button>
            : <button type="button" className="primary-action" onClick={create}>{t('newProject.create')}<ArrowRight size={15} /></button>}
      </footer>
    </section>
  </div>
}

function SourceChoice({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" className={selected ? 'is-selected' : ''} onClick={onClick} aria-pressed={selected}>
    <span>{icon}</span><strong>{label}</strong>
  </button>
}
