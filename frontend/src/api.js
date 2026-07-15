// Fetch wrapper — all endpoints live under /api (Vite proxies to :8000).
const BASE = '/api'

function getToken() {
  return localStorage.getItem('accessToken')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers, ...options })

  if (res.status === 401) {
    localStorage.clear()
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
    localStorage.clear()
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
async function downloadRequest(path, filename) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, { headers })

  if (res.status === 401) {
    localStorage.clear()
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

// Authed media fetch — returns an object URL for inline playback (e.g. <video>).
// Caller is responsible for URL.revokeObjectURL when done.
async function mediaObjectUrl(path) {
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
  fileObjectUrl: (fileId) => mediaObjectUrl(`/files/${fileId}/download`),

  // Auth
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  register: (data) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),

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
  downloadFile: (id, filename) => downloadRequest(`/files/${id}/download`, filename),
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
}

export default api
