# Wedding Guest Memories

The PostgreSQL and R2 version runs alongside the legacy interface during migration. See [delivery progress](PROGRESS.md), [local PostgreSQL setup](POSTGRESQL_SCHEMA.md), and [recovery and load tests](PERFORMANCE_AND_RECOVERY_PLAN.md). Use Node 24, Docker Compose, and Chrome for local verification. The new owner interface is at `/admin/local` and issues QR links for `/join/[eventId]`.

Build the local Linux image with `docker build -t wedding-app-local:verify .`. The build step runs without external network access after the dependency install. The default legacy public configuration uses synthetic build values. Set actual legacy public build arguments only when rehearsing an approved live integration. Supply private database, R2 and MFA settings through the runtime secret store. The same image can run the worker with `node scripts/worker/run.mjs` and separate worker credentials.

A beautiful wedding guest media microsite built with Next.js and Supabase. Allow guests to upload photos, videos, text messages, and voice notes using a single link - no authentication required for guests!

## Features

### For Guests
- 📸 Upload photos and videos from mobile devices
- 💬 Leave heartfelt text messages with emoji support
- 🎤 Record and submit voice messages
- 👀 View live feed of approved wedding memories
- 📱 Mobile-first responsive design
- ⚡ Real-time updates

### For Couples (Admin)
- 🔐 Secure admin dashboard with authentication
- ⚙️ Manage wedding settings and preferences
- ✅ Content moderation (approve/hide submissions)
- 📥 Download all media as ZIP
- 🎛️ Toggle features on/off per event

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Postgres, Auth, Storage, RLS)
- **Real-time**: Supabase Realtime subscriptions
- **Deployment**: Vercel-ready

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd wedding-guest-app
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project
2. Run the SQL schema from `supabase/schema.sql`
3. Run the RLS policies from `supabase/rls-policies.sql`
4. Create a storage bucket named `wedding-media`

### 3. Environment Variables


Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## Database Schema

### Events Table
- `id` (UUID, Primary Key)
- `title` (Text) - Wedding title
- `date` (Date) - Wedding date
- `welcome_message` (Text) - Welcome message for guests
- `slug` (Text, Unique) - URL slug for public page
- `created_at` (Timestamp)

### Event Settings Table
- `id` (UUID, Primary Key)
- `event_id` (UUID, Foreign Key)
- `collect_photos` (Boolean)
- `collect_messages` (Boolean)
- `collect_voicemails` (Boolean)
- `moderation_enabled` (Boolean)

### Submissions Table
- `id` (UUID, Primary Key)
- `event_id` (UUID, Foreign Key)
- `type` (Enum: 'photo', 'video', 'message', 'voice')
- `content_url` (Text) - URL to media file
- `message_text` (Text) - Text message content
- `guest_name` (Text) - Optional guest name
- `approved` (Boolean) - Moderation status
- `created_at` (Timestamp)

## Security

- **Row Level Security (RLS)** enabled on all tables
- **Guests**: Can insert submissions, view only approved content
- **Admins**: Full CRUD access to their event data
- **Storage**: Public read access, authenticated write access

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Environment Variables for Production

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Usage

### Creating Events

1. Go to `/admin` and sign in with your Supabase credentials
2. Create a new event in the admin dashboard
3. Configure settings (photo/message/voice collection, moderation)
4. Share the event URL with guests: `https://your-domain.com/[slug]`

### Guest Experience

1. Guests visit the event URL
2. No login required - they can immediately participate
3. Upload photos/videos, leave messages, or record voice notes
4. View the live feed of approved memories

### Admin Management

1. Monitor submissions in real-time
2. Approve or hide content (if moderation enabled)
3. Download all media files
4. Update event settings anytime

## File Structure

```
src/
├── app/
│   ├── [slug]/          # Public event pages
│   ├── admin/           # Admin dashboard
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout
│   └── page.tsx        # Homepage
├── components/
│   ├── UploadModal.tsx  # Photo/video upload
│   ├── MessageModal.tsx # Text message
│   └── VoiceModal.tsx   # Voice recording
└── lib/
    ├── supabase.ts      # Supabase client
    └── utils.ts         # Utility functions
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this for your wedding or for commercial projects!

## Support

Built with ❤️ for happy couples everywhere. If you encounter any issues, please check:

1. Supabase project is correctly configured
2. Environment variables are set
3. RLS policies are applied
4. Storage bucket exists and has correct policies

Enjoy your wedding memories! 💍
"# weddingbox_new" 
