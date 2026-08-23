export interface PopoverAnchorRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

export interface PopoverViewport {
  width: number
  height: number
  layoutHeight: number
  offsetTop?: number
  offsetLeft?: number
}

export interface ViewportPopoverOptions {
  preferredWidth: number
  maxHeight: number
  minPreferredHeight: number
  viewportPadding?: number
  gap?: number
  align?: 'start' | 'end'
  matchAnchorWidth?: boolean
}

export interface ViewportPopoverPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  placement: 'above' | 'below'
}

export function positionViewportPopover(
  anchor: PopoverAnchorRect,
  viewport: PopoverViewport,
  options: ViewportPopoverOptions,
): ViewportPopoverPosition {
  const padding = options.viewportPadding ?? 12
  const gap = options.gap ?? 8
  const viewportTop = viewport.offsetTop ?? 0
  const viewportLeft = viewport.offsetLeft ?? 0
  const viewportBottom = viewportTop + viewport.height
  const viewportRight = viewportLeft + viewport.width
  const availableBelow = Math.max(0, viewportBottom - anchor.bottom - padding - gap)
  const availableAbove = Math.max(0, anchor.top - viewportTop - padding - gap)
  const placement = availableBelow >= Math.min(options.minPreferredHeight, options.maxHeight)
    || availableBelow >= availableAbove
    ? 'below'
    : 'above'
  const availableHeight = placement === 'below' ? availableBelow : availableAbove
  const maxHeight = Math.min(options.maxHeight, availableHeight)
  const requestedWidth = Math.max(
    options.preferredWidth,
    options.matchAnchorWidth ? anchor.width : 0,
  )
  const width = Math.min(requestedWidth, Math.max(0, viewport.width - padding * 2))
  const alignedLeft = options.align === 'end' ? anchor.right - width : anchor.left
  const left = Math.min(
    Math.max(viewportLeft + padding, alignedLeft),
    Math.max(viewportLeft + padding, viewportRight - padding - width),
  )

  if (placement === 'below') return {
    top: anchor.bottom + gap,
    left,
    width,
    maxHeight,
    placement,
  }
  return {
    bottom: Math.max(0, viewport.layoutHeight - anchor.top + gap),
    left,
    width,
    maxHeight,
    placement,
  }
}

export function readPopoverViewport(): PopoverViewport {
  const visual = window.visualViewport
  return {
    width: visual?.width ?? window.innerWidth,
    height: visual?.height ?? window.innerHeight,
    layoutHeight: window.innerHeight,
    offsetTop: visual?.offsetTop ?? 0,
    offsetLeft: visual?.offsetLeft ?? 0,
  }
}
