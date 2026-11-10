import { notFound } from 'next/navigation'
import ThemeStudio from './ThemeStudio'

export const metadata = { title: 'Wedding theme studio', robots: { index: false, follow: false } }

export default async function ThemePage({ params }: PageProps<'/admin/local/[eventId]/theme'>) {
  const { eventId } = await params
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId)) notFound()
  return <ThemeStudio eventId={eventId} />
}
