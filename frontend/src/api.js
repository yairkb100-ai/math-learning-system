// Fetch wrapper — all endpoints live under /api (Vite proxies to :8000).
const BASE = '/api'

function getToken() {
  return localStorage.getItem('accessToken')
}

// A stable per-browser id used to identify this device for the account's
// device limit. Generated once and persisted; survives logout (we only clear
// it if the user explicitly wants to "forget" the device — not done here).
function getDeviceId() {
  let id = localStorage.getItem('deviceId')
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('deviceId', id)
  }
  return id
}

// Clear the session but KEEP the deviceId — otherwise every logout would mint
// a fresh device and burn a slot against the account's device limit.
export function clearSession() {
  const deviceId = localStorage.getItem('deviceId')
  localStorage.clear()
  if (deviceId) localStorage.setItem('deviceId', deviceId)
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers, ...options })

  // A 401 on an authenticated request means the session died (expired/invalid
  // token) — force back to login. A 401 with no token attached is an anonymous
  // call (login/register) rejecting bad credentials, not a dead session; let it
  // fall through to the normal error below so the caller can show it inline.
  if (res.status === 401 && token) {
    clearSession()
    window.location.href = '/login'
    return
  }

  // A 402 means the user has no active subscription (server's
  // require_active_subscription). Send them to the friendly "My subscription"
  // page instead of surfacing a raw error, unless they're already there.
  if (res.status === 402) {
    if (window.location.pathname !== '/subscription') {
      window.location.href = '/subscription'
    }
    throw new Error('402 no_active_subscription')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new Error(`${res.status} ${detail}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Multipart upload — do NOT set Content-Type (browser sets the boundary),
// but keep the Bearer token from localStorage.
async function uploadRequest(path, formData) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (res.status === 401) {
    clearSession()
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new Error(`${res.status} ${detail}`)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Authed download — fetch with Bearer header, turn the response into a blob,
// then trigger a browser download via a temporary object URL.
//
// Files hosted on Bunny CDN (externalUrl set) skip the fetch entirely and
// open the CDN URL directly. Browsers refuse to auto-follow a redirect to a
// different origin when the request carries an Authorization header (a
// deliberate Fetch spec security rule) — trying to fetch() our backend's
// redirect for these throws "Failed to fetch" instead of reaching Bunny.
async function downloadRequest(path, filename, externalUrl) {
  if (externalUrl) {
    window.open(externalUrl, '_blank', 'noopener')
    return
  }

  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers })

  if (res.status === 401) {
    clearSession()
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Authed media fetch — returns a URL for inline playback (e.g. <video src>).
// Caller is responsible for URL.revokeObjectURL when done (a no-op for the
// externalUrl case, which isn't a blob: URL).
//
// See downloadRequest above for why externalUrl bypasses fetch() entirely.
async function mediaObjectUrl(path, externalUrl) {
  if (externalUrl) return externalUrl

  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(BASE + path, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export const api = {
  // Health
  health: () => request('/health'),

  // Inline media (video/audio players)
  fileObjectUrl: (fileId, externalUrl) =>
    mediaObjectUrl(`/files/${fileId}/download`, externalUrl),

  // Auth
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, device_id: getDeviceId() }),
    }),
  register: (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

  // Global content search (public, titles only)
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // Courses (student)
  listCourses: () => request('/courses'),
  getCourse: (id) => request(`/courses/${id}`),
  getChapter: (courseId, number) =>
    request(`/courses/${courseId}/chapters/${number}`),
  getSolution: (courseId, number, exerciseNumber) =>
    request(
      `/courses/${courseId}/chapters/${number}/exercises/${exerciseNumber}/solution`
    ),
  checkQuiz: ({ chapterId, questionNumber, answer }) =>
    request('/quiz/check', {
      method: 'POST',
      body: JSON.stringify({
        chapter_id: chapterId,
        question_number: questionNumber,
        answer,
      }),
    }),
  importCourse: (data) =>
    request('/courses/import', { method: 'POST', body: JSON.stringify(data) }),

  // Progress (student)
  getProgress: (courseId) => request(`/progress/${courseId}`),
  markChapterComplete: (courseId, chapterId) =>
    request(`/progress/${courseId}/chapters/${chapterId}/complete`, {
      method: 'POST',
    }),

  // Admin — users
  adminListUsers: () => request('/admin/users'),
  adminCreateUser: (data) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateUser: (id, data) =>
    request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteUser: (id) =>
    request(`/admin/users/${id}`, { method: 'DELETE' }),

  // Admin — student progress overview
  adminStudentsProgress: () => request('/admin/progress'),

  // Admin — enrollments
  adminListEnrollments: () => request('/admin/enrollments'),
  adminEnroll: (userId, courseId) =>
    request('/admin/enrollments', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, course_id: courseId }),
    }),
  adminUnenroll: (userId, courseId) =>
    request(`/admin/enrollments/${userId}/${courseId}`, { method: 'DELETE' }),

  // Admin — courses
  adminDeleteCourse: (id) =>
    request(`/admin/courses/${id}`, { method: 'DELETE' }),

  // Sections (חלקים)
  listSections: () => request('/sections'),
  createSection: (data) =>
    request('/admin/sections', { method: 'POST', body: JSON.stringify(data) }),
  updateSection: (id, data) =>
    request(`/admin/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSection: (id) =>
    request(`/admin/sections/${id}`, { method: 'DELETE' }),

  // Admin — course create / section assignment / reset
  createCourse: (data) =>
    request('/admin/courses', { method: 'POST', body: JSON.stringify(data) }),
  assignCourseSection: (courseId, sectionId) =>
    request(`/admin/courses/${courseId}/section`, {
      method: 'PUT',
      body: JSON.stringify({ section_id: sectionId }),
    }),
  resetStudent: (userId) =>
    request(`/admin/users/${userId}/progress`, { method: 'DELETE' }),

  // Messaging
  listConversations: () => request('/messages/conversations'),
  getThread: (userId) => request(`/messages/thread/${userId}`),
  sendMessage: (recipientId, body, fileId = null) =>
    request('/messages', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: recipientId, body, file_id: fileId }),
    }),
  unreadCount: () => request('/messages/unread_count'),
  listStaff: () => request('/messages/staff'),

  // Files
  listFiles: (courseId) =>
    request(`/files${courseId != null ? `?course_id=${courseId}` : ''}`),
  uploadFile: (file, courseId, kind = 'resource', asName = null) => {
    const fd = new FormData()
    // asName overrides the stored filename (e.g. prefixing "פרק-N" so the
    // file is associated with a specific chapter).
    if (asName) fd.append('file', file, asName)
    else fd.append('file', file)
    if (courseId != null) fd.append('course_id', courseId)
    fd.append('kind', kind)
    return uploadRequest('/files', fd)
  },
  downloadFile: (id, filename, externalUrl) =>
    downloadRequest(`/files/${id}/download`, filename, externalUrl),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),

  // Subscriptions / billing
  listPlans: () => request('/plans'),
  mySubscription: () => request('/me/subscription'),
  adminSubscriptions: () => request('/admin/subscriptions'),
  assignSubscription: (userId, planCode) =>
    request('/admin/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, plan_code: planCode }),
    }),
  extendSubscription: (subId, days = 30) =>
    request(`/admin/subscriptions/${subId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),
  cancelSubscription: (subId) =>
    request(`/admin/subscriptions/${subId}/cancel`, { method: 'POST' }),

  // Admin — devices & login audit
  adminDevices: () => request('/admin/devices'),
  adminDeleteDevice: (id) => request(`/admin/devices/${id}`, { method: 'DELETE' }),
  adminLoginEvents: (limit = 200) =>
    request(`/admin/login-events?limit=${limit}`),
  adminChapterViews: (userId = null, limit = 300) =>
    request(
      `/admin/chapter-views?limit=${limit}` +
        (userId != null ? `&user_id=${userId}` : ''),
    ),
  adminDeleteChapterView: (id) =>
    request(`/admin/chapter-views/${id}`, { method: 'DELETE' }),
  adminClearChapterViews: (userId = null) =>
    request(
      '/admin/chapter-views' + (userId != null ? `?user_id=${userId}` : ''),
      { method: 'DELETE' },
    ),
  adminGetMaxDevices: () => request('/admin/settings/max-devices'),
  adminSetMaxDevices: (maxDevices) =>
    request('/admin/settings/max-devices', {
      method: 'PUT',
      body: JSON.stringify({ max_devices: maxDevices }),
    }),

  // Practice (student)
  getPracticeQuestions: ({ subject, difficulty, topic, limit } = {}) => {
    const qs = new URLSearchParams()
    if (subject) qs.set('subject', subject)
    if (difficulty) qs.set('difficulty', difficulty)
    if (topic) qs.set('topic', topic)
    if (limit != null) qs.set('limit', limit)
    const s = qs.toString()
    return request(`/practice/questions${s ? `?${s}` : ''}`)
  },
  submitPracticeAttempt: ({ questionId, answer, timeSpent = 0 }) =>
    request('/practice/attempts', {
      method: 'POST',
      body: JSON.stringify({
        question_id: questionId,
        answer,
        time_spent: timeSpent,
      }),
    }),
  getPracticeStats: () => request('/practice/stats'),
  getPracticeTopics: () => request('/practice/topics'),

  // Analytics (student)
  getAnalytics: () => request('/analytics/me'),

  // Exams (adaptive)
  listExams: () => request('/exams'),
  getExam: (id) => request(`/exams/${id}`),
  examNext: (id, history) =>
    request(`/exams/${id}/next`, {
      method: 'POST',
      body: JSON.stringify({ history }),
    }),
  submitExam: (id, { answers, timeTakenSeconds = 0 }) =>
    request(`/exams/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, time_taken_seconds: timeTakenSeconds }),
    }),
  listExamSubmissions: () => request('/exams/submissions'),
  getExamSubmission: (id) => request(`/exams/submissions/${id}`),

  // Achievements
  listAchievements: () => request('/achievements'),

  // Private lessons — student
  lessonSlots: () => request('/lessons/slots'),
  requestLesson: (slotId, studentNote = null) =>
    request('/lessons/requests', {
      method: 'POST',
      body: JSON.stringify({ slot_id: slotId, student_note: studentNote }),
    }),
  myLessonRequests: () => request('/lessons/my-requests'),
  cancelLessonRequest: (reqId) =>
    request(`/lessons/requests/${reqId}/cancel`, { method: 'POST' }),

  // Private lessons — admin
  adminLessonSlots: () => request('/admin/lessons/slots'),
  adminCreateLessonSlot: ({ startsAt, durationMin = 45, note = null }) =>
    request('/admin/lessons/slots', {
      method: 'POST',
      body: JSON.stringify({ starts_at: startsAt, duration_min: durationMin, note }),
    }),
  adminGenerateLessonSlots: ({ startDate, endDate, weekdays, times, durationMin = 45 }) =>
    request('/admin/lessons/slots/generate', {
      method: 'POST',
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        weekdays,
        times,
        duration_min: durationMin,
      }),
    }),
  adminToggleLessonSlotBlock: (slotId) =>
    request(`/admin/lessons/slots/${slotId}/block`, { method: 'POST' }),
  adminDeleteLessonSlot: (slotId) =>
    request(`/admin/lessons/slots/${slotId}`, { method: 'DELETE' }),
  adminLessonRequests: (status = null) =>
    request(`/admin/lessons/requests${status ? `?status=${status}` : ''}`),
  adminLessonPendingCount: () => request('/admin/lessons/pending-count'),
  adminApproveLessonRequest: (reqId, adminNote = null) =>
    request(`/admin/lessons/requests/${reqId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: adminNote }),
    }),
  adminDeclineLessonRequest: (reqId, adminNote = null) =>
    request(`/admin/lessons/requests/${reqId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: adminNote }),
    }),
}

export default api
