import { database } from './db'

export async function eventConfig(eventId: string) {
  const { rows: [settings] } = await database().query<{
    title: string; welcome_message: string | null; gallery_enabled: boolean
    uploads_enabled: boolean; messages_enabled: boolean; voice_enabled: boolean
  }>('SELECT * FROM wedding.guest_event_config($1)', [eventId])
  return settings
}
