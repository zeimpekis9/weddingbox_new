export const collageLimit = 80
export type Layout = 'grid' | 'featured'

export async function makeCollage(files: File[], layout: Layout, signal: AbortSignal) {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 1080
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.fillStyle = '#f5f0e7'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const featured = layout === 'featured' && files.length > 1
  const top = featured ? 360 : 0
  const count = files.length - Number(featured)
  const columns = Math.ceil(Math.sqrt(count * canvas.width / (canvas.height - top)))
  const rows = Math.ceil(count / columns)
  const height = (canvas.height - top) / rows
  let skipped = 0
  for (let index = 0; index < files.length; index++) {
    signal.throwIfAborted()
    const isHero = featured && index === 0
    const tile = index - Number(featured)
    const row = Math.floor(tile / columns)
    const width = isHero ? canvas.width : canvas.width / Math.min(columns, count - row * columns)
    const x = isHero ? 0 : (tile % columns) * width
    const y = isHero ? 0 : top + row * height
    const tileHeight = isHero ? top : height
    const url = URL.createObjectURL(files[index])
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      signal.throwIfAborted()
      const ratio = Math.max((width - 4) / image.naturalWidth, (tileHeight - 4) / image.naturalHeight)
      const cropWidth = (width - 4) / ratio
      const cropHeight = (tileHeight - 4) / ratio
      context.drawImage(image, (image.naturalWidth - cropWidth) / 2, (image.naturalHeight - cropHeight) / 2,
        cropWidth, cropHeight, x + 2, y + 2, width - 4, tileHeight - 4)
    } catch (error) {
      if (signal.aborted) throw error
      skipped++
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  if (skipped === files.length) throw new Error('No selected photos could be read')
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.84))
  signal.throwIfAborted()
  if (!blob || !['image/webp', 'image/png'].includes(blob.type) || blob.size > 2 * 1024 * 1024) {
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!jpeg || jpeg.size > 2 * 1024 * 1024) throw new Error('Could not compress the collage')
    return { file: new File([jpeg], 'collage.jpg', { type: jpeg.type }), skipped }
  }
  return { file: new File([blob], blob.type === 'image/webp' ? 'collage.webp' : 'collage.png', { type: blob.type }), skipped }
}
