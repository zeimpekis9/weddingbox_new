import { notFound } from 'next/navigation'
import GuestUpload from './GuestUpload'

export const metadata = {
  title: 'Wedding uploads',
  robots: { index: false, follow: false },
}

export default async function JoinPage({ params }: PageProps<'/join/[eventId]'>) {
  const { eventId } = await params
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId)) notFound()
  return <GuestUpload key={eventId} eventId={eventId} />
}
