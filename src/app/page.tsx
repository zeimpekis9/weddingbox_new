import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[90dvh] max-w-xl items-center justify-center px-4 py-8 text-center">
      <div className="w-full">
        <div className="mb-8">
          <h1 className="mb-4 text-3xl sm:text-5xl">
            Wedding Guest Memories
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Create beautiful wedding memory pages where your guests can share photos, messages, and voice notes.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">For Guests</h2>
            <p className="text-gray-600 mb-4">
              Visit your wedding event page to share memories with the happy couple.
            </p>
            <div className="text-sm text-gray-500">
              Enter the event URL provided by the couple
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">For Couples</h2>
            <p className="text-gray-600 mb-4">
              Manage your wedding events and moderate guest submissions.
            </p>
            <Link
              href="/admin" 
              className="btn-primary inline-flex items-center"
            >
              Go to Admin Dashboard →
            </Link>
          </div>
        </div>

        <div className="mt-12 text-sm text-gray-500">
          <p>Built with ❤️ for happy couples everywhere</p>
        </div>
      </div>
    </main>
  )
}
