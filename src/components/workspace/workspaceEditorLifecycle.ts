import type { WorkspaceSectionId } from '../../core/workspace'

export function shouldDismissWorkspaceEditor(
  previousSection: WorkspaceSectionId,
  nextSection: WorkspaceSectionId,
) {
  return previousSection !== nextSection
}

type ScrollLockStyle = Pick<
  CSSStyleDeclaration,
  'left' | 'overflow' | 'overscrollBehavior' | 'position' | 'top' | 'width'
>

interface ScrollLockDocument {
  body: { style: ScrollLockStyle }
  documentElement: { style: ScrollLockStyle }
}

interface ScrollLockWindow {
  scrollX: number
  scrollY: number
  scrollTo: (x: number, y: number) => void
}

interface ScrollLockState {
  count: number
  body: Record<keyof ScrollLockStyle, string>
  root: Record<keyof ScrollLockStyle, string>
  scrollX: number
  scrollY: number
  windowObject: ScrollLockWindow
}

const scrollLocks = new WeakMap<object, ScrollLockState>()

const scrollStyleKeys: Array<keyof ScrollLockStyle> = [
  'left',
  'overflow',
  'overscrollBehavior',
  'position',
  'top',
  'width',
]

function snapshotStyle(style: ScrollLockStyle): Record<keyof ScrollLockStyle, string> {
  return Object.fromEntries(scrollStyleKeys.map((key) => [key, style[key]])) as Record<
    keyof ScrollLockStyle,
    string
  >
}

function restoreStyle(style: ScrollLockStyle, snapshot: Record<keyof ScrollLockStyle, string>) {
  scrollStyleKeys.forEach((key) => {
    style[key] = snapshot[key]
  })
}

export function lockWorkspaceDocumentScroll(
  windowObject: ScrollLockWindow,
  documentObject: ScrollLockDocument,
): () => void {
  const existing = scrollLocks.get(documentObject)
  if (existing) {
    existing.count += 1
  } else {
    const state: ScrollLockState = {
      count: 1,
      body: snapshotStyle(documentObject.body.style),
      root: snapshotStyle(documentObject.documentElement.style),
      scrollX: windowObject.scrollX,
      scrollY: windowObject.scrollY,
      windowObject,
    }
    scrollLocks.set(documentObject, state)

    documentObject.documentElement.style.overflow = 'hidden'
    documentObject.documentElement.style.overscrollBehavior = 'none'
    documentObject.body.style.overflow = 'hidden'
    documentObject.body.style.overscrollBehavior = 'none'
    documentObject.body.style.position = 'fixed'
    documentObject.body.style.top = `-${state.scrollY}px`
    documentObject.body.style.left = `-${state.scrollX}px`
    documentObject.body.style.width = '100%'
  }

  let released = false
  return () => {
    if (released) return
    released = true

    const state = scrollLocks.get(documentObject)
    if (!state) return
    state.count -= 1
    if (state.count > 0) return

    restoreStyle(documentObject.body.style, state.body)
    restoreStyle(documentObject.documentElement.style, state.root)
    scrollLocks.delete(documentObject)
    state.windowObject.scrollTo(state.scrollX, state.scrollY)
  }
}
