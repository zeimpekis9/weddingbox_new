import { database } from './db'

export async function eventConfig(eventId: string) {
  const { rows: [settings] } = await database().query<{
    title: string; welcome_message: string | null; gallery_enabled: boolean
    uploads_enabled: boolean; messages_enabled: boolean; voice_enabled: boolean
  }>('SELECT * FROM wedding.guest_event_config($1)', [eventId])
  if (settings && process.env.WEDDING_UPLOAD_ONLY === '1') {
    return { ...settings, gallery_enabled: false, messages_enabled: false, voice_enabled: false }
  }
  return settings
}

export async function eventProfile(eventId: string) {
  const { rows: [profile] } = await database().query<{
    slug: string; event_date: string | null; primary_color: string | null
  }>('SELECT slug,event_date::text,primary_color FROM wedding.event_profile($1)', [eventId])
  return profile
}
