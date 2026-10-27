// Inverted lists measure from the newest end; a cell's logical end is its
// visual top. Keep targets by ID because streaming can change list indices.
export class MessageNavigation {
  ids: string[] = []
  frames = new Map<string, { y: number; height: number }>()
  offset = 0
  height = 0
  expected: number | undefined
  target: string | undefined
  anchor: { id: string; offset: number; height: number } | undefined

  sync(ids: string[]) {
    this.ids = ids
    if (this.target && !ids.includes(this.target)) this.target = undefined
    if (this.anchor && !ids.includes(this.anchor.id)) this.anchor = undefined
    for (const id of this.frames.keys()) {
      if (!ids.includes(id)) this.frames.delete(id)
    }
  }

  current() {
    if (this.target) return this.ids.indexOf(this.target)
    if (this.anchor) return this.ids.indexOf(this.anchor.id)
    return this.visible()
  }

  visible() {
    const top = this.offset + this.height
    // Include exact starts, but not the end of the older adjacent cell.
    const visible = this.ids.findIndex((id) => {
      const frame = this.frames.get(id)
      return frame && frame.height > 0 && frame.y < top && frame.y + frame.height >= top - 1
    })
    if (visible >= 0) return visible
    const nearest = this.ids.map((id, index) => ({ index, frame: this.frames.get(id) }))
      .filter((item) => item.frame && item.frame.height > 0 && item.frame.y < top)
      .sort((a, b) => b.frame!.y - a.frame!.y)[0]
    return nearest?.index ?? -1
  }

  move(direction: 1 | -1) {
    const current = this.current()
    if (current < 0) return undefined
    const index = current + direction
    if (index < 0 || index >= this.ids.length) return undefined
    this.target = this.ids[index]
    return index
  }

  destination() {
    if (!this.target) return undefined
    const frame = this.frames.get(this.target)
    if (!frame || frame.height <= 0 || this.height <= 0) return undefined
    return Math.max(0, frame.y + frame.height - this.height)
  }

  manual(offset?: number) {
    this.target = undefined
    this.anchor = undefined
    this.expected = offset
    if (offset !== undefined) this.offset = offset
  }

  observe(offset: number, height: number) {
    if (this.height !== height) this.expected = undefined
    // Earlier programmatic scroll callbacks can arrive after a newer tap.
    // Keep its boundary until native scrolling acknowledges the latest command.
    if (this.expected !== undefined && Math.abs(this.expected - offset) > 1) return
    this.expected = undefined
    this.offset = offset
    this.height = height
    if (this.anchor && (Math.abs(this.anchor.offset - offset) > 1 || this.anchor.height !== height)) {
      this.anchor = undefined
    }
  }

  complete(offset: number) {
    if (this.target) this.anchor = { id: this.target, offset, height: this.height }
    this.expected = offset
    this.offset = offset
    this.target = undefined
  }

  seek(list: {
    scrollToOffset(params: { offset: number; animated: boolean }): void
    scrollToIndex(params: { index: number; viewPosition: number; animated: boolean }): void
  }, attempt: number) {
    if (!this.target) return false
    const index = this.ids.indexOf(this.target)
    if (index < 0) return false
    const offset = this.destination()
    if (offset !== undefined) {
      list.scrollToOffset({ offset, animated: false })
      this.complete(offset)
      return false
    }
    if (attempt >= 20) {
      this.manual()
      return false
    }
    if (attempt === 0) {
      list.scrollToIndex({ index, viewPosition: 1, animated: false })
      return true
    }
    // RN may accept estimated metrics without mounting the target. Advance
    // the render window until a real target frame arrives, even without failure.
    const visible = this.visible()
    const direction = visible < 0 || index > visible ? 1 : -1
    list.scrollToOffset({ offset: Math.max(0, this.offset + direction * this.height * 0.8), animated: false })
    return true
  }
}
