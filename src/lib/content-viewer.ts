export interface ContentViewerState {
  title: string
  language?: string
  content: string
}

let current: ContentViewerState | null = null

export function setContentViewer(state: ContentViewerState): void {
  current = state
}

export function getContentViewer(): ContentViewerState | null {
  return current
}
