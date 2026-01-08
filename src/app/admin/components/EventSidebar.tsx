'use client'

import { Database } from '@/lib/supabase'

type Event = Database['public']['Tables']['events']['Row']

interface EventSidebarProps {
  events: Event[]
  selectedEvent: Event | null
  onSelectEvent: (event: Event) => void
}

export default function EventSidebar({ events, selectedEvent, onSelectEvent }: EventSidebarProps) {
  return (
    <div className="lg:col-span-1">
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Events</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                selectedEvent?.id === event.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
              }`}
            >
              <div className="font-medium text-gray-900">{event.title}</div>
              <div className="text-sm text-gray-500">{event.slug}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
