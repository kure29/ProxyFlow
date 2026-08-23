import type { CSSProperties } from 'react'
import { resolveServiceMarkId, serviceMarkDefinitions } from './serviceMarkDefinitions'

export function ServiceMark({ serviceId, selected = false, size = 'default', className }: {
  serviceId: string
  selected?: boolean
  size?: 'small' | 'default'
  className?: string
}) {
  const id = resolveServiceMarkId(serviceId)
  if (!id) return null
  const definition = serviceMarkDefinitions[id]
  const opticalRatio = size === 'small' ? 0.9 : 1
  const style = {
    '--service-mark-image': `url("${definition.asset}")`,
    '--service-mark-optical-width': `${definition.opticalWidth * opticalRatio}px`,
    '--service-mark-optical-height': `${definition.opticalHeight * opticalRatio}px`,
  } as CSSProperties

  return <span
    className={`service-mark service-mark--${size}${className ? ` ${className}` : ''}`}
    data-mode={definition.mode}
    data-selected={selected ? 'true' : undefined}
    data-service-mark={id}
    style={style}
    aria-hidden="true"
  >
    {definition.mode === 'monochrome'
      ? <span className="service-mark__image service-mark__image--monochrome" />
      : <img className="service-mark__image service-mark__image--fixed" src={definition.asset} alt="" draggable={false} />}
  </span>
}
