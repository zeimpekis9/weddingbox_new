export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Wedding Guest Memories
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Create beautiful wedding memory pages where your guests can share photos, messages, and voice notes.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">For Guests</h2>
            <p className="text-gray-600 mb-4">
              Visit your wedding event page to share memories with the happy couple.
            </p>
            <div className="text-sm text-gray-500">
              Enter the event URL provided by the couple
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">For Couples</h2>
            <p className="text-gray-600 mb-4">
              Manage your wedding events and moderate guest submissions.
            </p>
            <a 
              href="/admin" 
              className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium"
            >
              Go to Admin Dashboard →
            </a>
          </div>
        </div>

        <div className="mt-12 text-sm text-gray-500">
          <p>Built with ❤️ for happy couples everywhere</p>
        </div>
      </div>
    </div>
  )
}
