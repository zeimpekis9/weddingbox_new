import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

if (__ENV.WEDDING_LOAD_CONFIRM !== 'isolated-staging' || !/^https:\/\/[^/]+$/.test(__ENV.BASE_URL || '') ||
    !/^[a-f0-9-]{36}$/i.test(__ENV.EVENT_ID || '') || !/^[A-Za-z0-9_-]{43}$/.test(__ENV.GUEST_LINK || '')) {
  throw new Error('Configure an isolated HTTPS staging event and explicitly confirm the load run.')
}
const base = __ENV.BASE_URL
const event = `${base}/api/events/${__ENV.EVENT_ID}`
const photo = open(__ENV.PHOTO_FILE, 'b')
const video = open(__ENV.VIDEO_FILE, 'b')
const initSuccess = new Rate('upload_init_success')
const receiptSuccess = new Rate('upload_receipt_success')
const completionTime = new Trend('upload_verification_ms', true)
const guests = Number(__ENV.GUESTS || 100)
if (![100,300,500].includes(guests)) throw new Error('GUESTS must be 100, 300 or 500')
if (!photo.byteLength || video.byteLength < 32 * 1024 * 1024) throw new Error('Use a JPEG and a multipart MP4 fixture.')

export const options = {
  systemTags: ['status','method','name','scenario','expected_response','error_code'],
  scenarios: {
    guests: { executor: 'constant-vus', vus: guests, duration: __ENV.DURATION || '20m', exec: 'guest' },
    pageBurst: { executor: 'constant-arrival-rate', rate: 500, timeUnit: '10s', duration: '10s',
      preAllocatedVUs: 150, maxVUs: 500, exec: 'page' },
    startBurst: { executor: 'constant-arrival-rate', rate: 100, timeUnit: '5s', duration: '5s',
      preAllocatedVUs: 100, maxVUs: 100, exec: 'upload' },
  },
  thresholds: {
    'http_req_duration{name:guest_access}': ['p(95)<300','p(99)<1000'],
    'http_req_duration{name:upload_init}': ['p(95)<500'],
    dropped_iterations: ['count==0'],
    upload_init_success: ['rate>=0.995'],
    upload_receipt_success: ['rate>=0.99'],
    upload_verification_ms: ['p(95)<10000'],
  },
}

function api(url, input, name) {
  return http.post(url, JSON.stringify(input), {
    headers: { Origin: base, 'Content-Type': 'application/json' }, tags: { name }, redirects: 0,
  })
}

function authorize() {
  return api(`${event}/access`, { link: __ENV.GUEST_LINK }, 'guest_access').status === 200
}

export function page() {
  check(http.get(`${base}/join/${__ENV.EVENT_ID}`, { tags: { name: 'guest_page' } }),
    { 'guest page loads': result => result.status === 200 })
}

export function guest() {
  page()
  if (!authorize()) return
  check(http.get(`${event}/gallery`, { tags: { name: 'gallery' } }), {
    'gallery is available': result => result.status === 200,
  })
  if (__ITER === 0) upload(true)
  sleep(3 + Math.random() * 4)
}

export function upload(alreadyAuthorized = false) {
  if (alreadyAuthorized !== true && !authorize()) { initSuccess.add(false); return }
  const large = (__VU + __ITER) % 5 === 0
  const fixture = large ? video : photo
  const name = large ? 'fixture.mp4' : 'fixture.jpg'
  const mime = large ? 'video/mp4' : 'image/jpeg'
  const initial = api(`${event}/uploads`, { requestId: crypto.randomUUID(), filename: name,
    type: mime, bytes: fixture.byteLength }, 'upload_init')
  initSuccess.add(initial.status === 200)
  if (initial.status !== 200) return
  const info = initial.json()
  const url = `${event}/uploads/${info.id}`
  if (info.mode === 'single') {
    const transfer = http.put(info.url, fixture, { headers: info.headers, tags: { name: 'storage_put' }, redirects: 0 })
    if (transfer.status < 200 || transfer.status >= 300) { receiptSuccess.add(false); return }
  } else {
    for (let offset = 0, part = 1; offset < fixture.byteLength; offset += info.partSize, part++) {
      const signed = api(url, { action: 'part', part }, 'upload_part')
      if (signed.status !== 200) { receiptSuccess.add(false); return }
      const transfer = http.put(signed.json('url'), fixture.slice(offset, offset + info.partSize),
        { tags: { name: 'storage_part' }, redirects: 0 })
      if (transfer.status < 200 || transfer.status >= 300) { receiptSuccess.add(false); return }
    }
  }
  const started = Date.now()
  const receipt = api(url, { action: 'complete' }, 'upload_complete')
  receiptSuccess.add(receipt.status === 200 && receipt.json('state') === 'uploaded')
  completionTime.add(Date.now() - started)
}
