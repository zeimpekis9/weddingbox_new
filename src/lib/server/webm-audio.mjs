// EBML integers encode their width in the first set bit. Element IDs keep that
// bit, while sizes omit it and may use all ones to indicate unknown length.
function integer(bytes, offset, end, isId) {
  const first = bytes[offset]
  if (!first || offset >= end) return null
  const width = Math.clz32(first) - 23
  if (offset + width > end || (isId && width > 4)) return null
  const marker = 1 << (8 - width)
  let value = isId ? first : first - marker
  let unknown = !isId && value === marker - 1
  for (let index = 1; index < width; index++) {
    const byte = bytes[offset + index]
    value = value * 256 + byte
    unknown &&= byte === 255
  }
  if (!unknown && !Number.isSafeInteger(value)) return null
  return { value: unknown ? Infinity : value, next: offset + width }
}

function element(bytes, offset, end) {
  const id = integer(bytes, offset, end, true)
  const size = id && integer(bytes, id.next, end, false)
  if (!size) return null
  return { id: id.value, start: size.next, end: size.next + size.value }
}

function* children(bytes, start, end) {
  while (start < end) {
    const child = element(bytes, start, end)
    if (!child || child.end > end) throw new Error('Incomplete WebM metadata')
    yield child
    start = child.end
  }
}

export function audioOnlyWebm(bytes) {
  const header = element(bytes, 0, bytes.length)
  if (header?.id !== 0x1a45dfa3 || header.end > bytes.length) return false
  const segment = element(bytes, header.end, bytes.length)
  if (segment?.id !== 0x18538067) return false
  for (const child of children(bytes, segment.start, Math.min(bytes.length, segment.end))) {
    if (child.id === 0x1f43b675) return false // Media cluster before track metadata.
    if (child.id !== 0x1654ae6b) continue
    let audioTracks = 0
    for (const entry of children(bytes, child.start, child.end)) {
      if (entry.id !== 0xae) continue
      const types = [...children(bytes, entry.start, entry.end)].filter(field => field.id === 0x83)
      if (types.length !== 1 || types[0].end !== types[0].start + 1 || bytes[types[0].start] !== 2) return false
      audioTracks++
    }
    return audioTracks > 0
  }
  return false
}
