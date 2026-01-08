import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string
          title: string
          date: string
          welcome_message: string
          slug: string
          created_at: string
          cover_photo_url?: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          primary_font?: string
        }
        Insert: {
          id?: string
          title: string
          date: string
          welcome_message: string
          slug: string
          created_at?: string
          cover_photo_url?: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          primary_font?: string
        }
        Update: {
          id?: string
          title?: string
          date?: string
          welcome_message?: string
          slug?: string
          created_at?: string
          cover_photo_url?: string
          primary_color?: string
          secondary_color?: string
          accent_color?: string
          primary_font?: string
        }
      }
      event_settings: {
        Row: {
          id: string
          event_id: string
          collect_photos: boolean
          collect_messages: boolean
          collect_voicemails: boolean
          moderation_enabled: boolean
          show_ceremony_tab?: boolean
          show_afterparty_tab?: boolean
          show_album_tab?: boolean
          tab_ceremony_name?: string
          tab_afterparty_name?: string
          tab_album_name?: string
          tab_ceremony_content?: string
          tab_afterparty_content?: string
          tab_album_content?: string
          manual_approval?: boolean
          auto_approval_delay?: number
        }
        Insert: {
          id?: string
          event_id: string
          collect_photos: boolean
          collect_messages: boolean
          collect_voicemails: boolean
          moderation_enabled: boolean
          show_ceremony_tab?: boolean
          show_afterparty_tab?: boolean
          show_album_tab?: boolean
          tab_ceremony_name?: string
          tab_afterparty_name?: string
          tab_album_name?: string
          tab_ceremony_content?: string
          tab_afterparty_content?: string
          tab_album_content?: string
          manual_approval?: boolean
          auto_approval_delay?: number
        }
        Update: {
          id?: string
          event_id?: string
          collect_photos?: boolean
          collect_messages?: boolean
          collect_voicemails?: boolean
          moderation_enabled?: boolean
          show_ceremony_tab?: boolean
          show_afterparty_tab?: boolean
          show_album_tab?: boolean
          tab_ceremony_name?: string
          tab_afterparty_name?: string
          tab_album_name?: string
          tab_ceremony_content?: string
          tab_afterparty_content?: string
          tab_album_content?: string
          manual_approval?: boolean
          auto_approval_delay?: number
        }
      }
      submissions: {
        Row: {
          id: string
          event_id: string
          type: 'photo' | 'video' | 'message' | 'voice'
          content_url: string | null
          message_text: string | null
          guest_name: string | null
          approved: boolean
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          type: 'photo' | 'video' | 'message' | 'voice'
          content_url: string | null
          message_text: string | null
          guest_name: string | null
          approved: boolean
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          type?: 'photo' | 'video' | 'message' | 'voice'
          content_url?: string | null
          message_text?: string | null
          guest_name?: string | null
          approved?: boolean
          created_at?: string
        }
      }
    }
  }
}

export type Event = Database['public']['Tables']['events']['Row'] & {
  cover_photo_url?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  primary_font?: string
}

export type EventSettings = Database['public']['Tables']['event_settings']['Row'] & {
  show_ceremony_tab?: boolean
  show_afterparty_tab?: boolean
  show_album_tab?: boolean
  tab_ceremony_name?: string
  tab_afterparty_name?: string
  tab_album_name?: string
  tab_ceremony_content?: string
  tab_afterparty_content?: string
  tab_album_content?: string
  manual_approval?: boolean
  auto_approval_delay?: number
}

export type Submission = Database['public']['Tables']['submissions']['Row']
