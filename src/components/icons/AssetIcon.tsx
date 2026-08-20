import type { SyntheticEvent } from 'react'

interface AssetIconProps {
  src?: string
  darkSrc?: string
  fallback: string
  className: string
}

export function AssetIcon({ src, darkSrc, fallback, className }: AssetIconProps) {
  const hideBrokenImage = (event: SyntheticEvent<HTMLImageElement>) => { event.currentTarget.hidden = true }
  return <span className={`asset-icon ${className}`} aria-hidden="true">
    <span>{fallback}</span>
    {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={hideBrokenImage} />}
    {darkSrc && <img className="asset-icon-dark" src={darkSrc} alt="" loading="lazy" referrerPolicy="no-referrer" onError={hideBrokenImage} />}
  </span>
}
