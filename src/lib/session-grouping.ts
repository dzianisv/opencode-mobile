// Pure helpers for grouping the session list by project directory.
// No React Native imports — unit-testable with node --test.

/** A contiguous-by-directory bucket of items, in first-seen order. */
export interface DirectoryGroup<T> {
  directory: string
  items: T[]
}

/**
 * Groups items by their `directory` field, preserving both the original
 * item order within a group and the order in which each directory was
 * first encountered. Does not sort — callers decide presentation order.
 */
export function groupByDirectory<T extends { directory: string }>(items: T[]): DirectoryGroup<T>[] {
  const order: string[] = []
  const buckets = new Map<string, T[]>()

  for (const item of items) {
    const dir = item.directory
    let bucket = buckets.get(dir)
    if (!bucket) {
      bucket = []
      buckets.set(dir, bucket)
      order.push(dir)
    }
    bucket.push(item)
  }

  return order.map((directory) => ({ directory, items: buckets.get(directory) as T[] }))
}
