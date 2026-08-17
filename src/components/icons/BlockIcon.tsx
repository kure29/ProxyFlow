import {
  ArrowDownUp, Blocks, Braces, ClipboardPaste, Cloud, CopyMinus, CornerDownRight, FileInput, Gauge,
  GitMerge, Globe2, Landmark, ListEnd, ListFilter, MousePointer2, PackageCheck, Pin,
  Play, Radio, RefreshCw, Route, Scale, Send, Server, Sparkles, TextCursorInput,
  Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  radio: Radio, server: Server, cloud: Cloud, 'clipboard-paste': ClipboardPaste, 'file-input': FileInput, 'list-filter': ListFilter,
  'text-cursor': TextCursorInput, 'arrow-down-up': ArrowDownUp, 'copy-minus': CopyMinus,
  'git-merge': GitMerge, 'list-end': ListEnd, 'mouse-pointer-2': MousePointer2, gauge: Gauge,
  'refresh-cw': RefreshCw, scale: Scale, pin: Pin, route: Route, waypoints: Waypoints,
  blocks: Blocks, braces: Braces, 'corner-down-right': CornerDownRight, 'globe-2': Globe2,
  'package-check': PackageCheck, sparkles: Sparkles, play: Play, send: Send, landmark: Landmark,
}

export function BlockIcon({ name, size = 16, strokeWidth = 1.8 }: { name: string; size?: number; strokeWidth?: number }) {
  const Icon = icons[name] ?? Blocks
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
