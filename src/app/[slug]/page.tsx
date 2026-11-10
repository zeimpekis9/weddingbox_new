import { notFound, redirect } from 'next/navigation'
import { database } from '@/lib/server/db'

async function findEvent(slug: string) {
  try {
    const { rows: [event] } = await database()
      .query<{ id: string | null }>('SELECT wedding.event_for_slug($1) AS id', [slug])
    return event?.id
  } catch {
    return null
  }
}

export default async function EventAlias({ params }: PageProps<'/[slug]'>) {
  const { slug } = await params
  if (slug.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound()
  const id = await findEvent(slug)
  if (!id) notFound()
  redirect(`/join/${id}`)
}
