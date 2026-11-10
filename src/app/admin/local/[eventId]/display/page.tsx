import { notFound } from 'next/navigation'
import Ceremony from './Ceremony'

export const metadata = { title: 'Ceremony display', robots: { index: false, follow: false } }

export default async function DisplayPage({ params }: PageProps<'/admin/local/[eventId]/display'>) {
  const { eventId } = await params
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId)) notFound()
  return <Ceremony key={eventId} eventId={eventId} />
}
