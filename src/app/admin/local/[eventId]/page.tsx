import { notFound } from 'next/navigation'
import EventDashboard from './EventDashboard'

export const metadata = { robots: { index: false, follow: false } }

export default async function AdminEvent({ params }: PageProps<'/admin/local/[eventId]'>) {
  const { eventId } = await params
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId)) notFound()
  return <EventDashboard key={eventId} eventId={eventId} />
}
