import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'
import { IconPaperclip, IconArrowStart, IconX, IconUsers } from '../components/icons.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/comms-files-shared.css'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Attachment({ file }) {
  const isImage = (file.content_type || '').startsWith('image/')
  const [imgUrl, setImgUrl] = useState(null)

  useEffect(() => {
    if (!isImage) return
    let url = null
    let cancelled = false
    api.fileObjectUrl(file.id).then((u) => {
      if (cancelled) return
      url = u
      setImgUrl(u)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file.id, isImage])

  if (isImage) {
    return imgUrl ? (
      <a href={imgUrl} target="_blank" rel="noreferrer" className="chat-attachment-image-link">
        <img src={imgUrl} alt={file.original_name} className="chat-attachment-image" />
      </a>
    ) : (
      <div className="chat-attachment-loading muted">טוען תמונה…</div>
    )
  }

  return (
    <button
      type="button"
      className="chat-attachment-file"
      onClick={() => api.downloadFile(file.id, file.original_name)}
    >
      <span className="chat-attachment-icon"><IconPaperclip /></span>
      <span className="chat-attachment-name">{file.original_name}</span>
      <span className="chat-attachment-size muted">{formatSize(file.size)}</span>
    </button>
  )
}

function BroadcastModal({ students, onClose, onSent }) {
  const [mode, setMode] = useState('active') // 'active' | 'all' | 'pick'
  const [sel, setSel] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(query.trim().toLowerCase())
  )

  function toggle(id) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSend = mode === 'pick' ? sel.size > 0 : students.length > 0

  async function submit(e) {
    e.preventDefault()
    if (!body.trim() && !file) return
    if (mode === 'pick' && sel.size === 0) {
      setErr('בחרו לפחות תלמיד אחד.')
      return
    }
    setSending(true)
    setErr(null)
    try {
      let fileId = null
      if (file) {
        const uploaded = await api.uploadFile(file, null, 'message')
        fileId = uploaded.id
      }
      const recipientIds = mode === 'pick' ? Array.from(sel) : null
      const res = await api.broadcastMessage(
        body.trim(),
        fileId,
        recipientIds,
        mode === 'all',
      )
      onSent(res.sent)
    } catch (e2) {
      setErr(e2.message)
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" dir="rtl" onClick={onClose}>
      <div className="modal-card broadcast-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="סגירה">
          <IconX />
        </button>
        <h2>הודעת תפוצה</h2>
        <p className="muted">ההודעה תגיע לתיבת ההודעות של כל נמען כשיחה רגילה.</p>

        <form onSubmit={submit}>
          <div className="broadcast-mode">
            <label>
              <input
                type="radio"
                name="bc-mode"
                checked={mode === 'active'}
                onChange={() => setMode('active')}
              />
              כל התלמידים הפעילים
            </label>
            <label>
              <input
                type="radio"
                name="bc-mode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              כל הרשומים (כולל לא-פעילים)
            </label>
            <label>
              <input
                type="radio"
                name="bc-mode"
                checked={mode === 'pick'}
                onChange={() => setMode('pick')}
              />
              בחירה ידנית
            </label>
          </div>

          {mode === 'pick' && (
            <div className="broadcast-picker">
              <input
                type="text"
                placeholder="חיפוש תלמיד…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="broadcast-picker-list">
                {filtered.map((s) => (
                  <label key={s.user_id} className="broadcast-picker-row">
                    <input
                      type="checkbox"
                      checked={sel.has(s.user_id)}
                      onChange={() => toggle(s.user_id)}
                    />
                    {s.full_name}
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="muted empty-msg">אין תוצאות.</p>
                )}
              </div>
              <div className="broadcast-picker-actions">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setSel(new Set(filtered.map((s) => s.user_id)))}
                >
                  בחר הכל
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => setSel(new Set())}
                >
                  נקה
                </button>
              </div>
            </div>
          )}

          <textarea
            className="broadcast-body"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="כתבו את ההודעה…"
          />

          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFile(f)
              e.target.value = ''
            }}
          />
          {file ? (
            <div className="chat-pending-file">
              <span className="chat-attachment-icon"><IconPaperclip /></span>
              <span className="chat-attachment-name">{file.name}</span>
              <button
                type="button"
                className="chat-pending-file-remove"
                onClick={() => setFile(null)}
                aria-label="הסר קובץ"
              >
                <IconX />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-sm broadcast-attach"
              onClick={() => fileRef.current?.click()}
            >
              <IconPaperclip width={16} height={16} />
              צרף קובץ
            </button>
          )}

          {err && <p className="form-error">{err}</p>}

          <motion.button
            className="btn broadcast-send"
            disabled={sending || (!body.trim() && !file) || !canSend}
            {...tapScale}
          >
            {sending
              ? 'שולח…'
              : mode === 'active'
                ? 'שלח לכל התלמידים הפעילים'
                : mode === 'all'
                  ? 'שלח לכל הרשומים'
                  : `שלח ל-${sel.size} תלמידים`}
          </motion.button>
        </form>
      </div>
    </div>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [conversations, setConversations] = useState([])
  const [contacts, setContacts] = useState([]) // people I can start a chat with
  const [active, setActive] = useState(null) // { user_id, full_name }
  const [thread, setThread] = useState([])
  const [draft, setDraft] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [bcOpen, setBcOpen] = useState(false)
  const [bcFlash, setBcFlash] = useState(null)
  const threadEnd = useRef(null)
  const fileInputRef = useRef(null)

  const loadConversations = useCallback(() => {
    return api.listConversations().then((data) => {
      setConversations(Array.isArray(data) ? data : [])
      return data
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const contactsP = isAdmin
      ? api.adminListUsers().then((us) =>
          (us || [])
            .filter((u) => u.role === 'student')
            .map((u) => ({ user_id: u.id, full_name: u.full_name }))
        )
      : api.listStaff().then((st) =>
          (st || []).map((s) => ({ user_id: s.id, full_name: s.full_name }))
        )

    Promise.all([loadConversations(), contactsP])
      .then(([, contactList]) => setContacts(contactList))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [isAdmin, loadConversations])

  const openThread = useCallback((party) => {
    setActive(party)
    api
      .getThread(party.user_id)
      .then((msgs) => setThread(Array.isArray(msgs) ? msgs : []))
      .then(() => loadConversations())
      .catch(setError)
  }, [loadConversations])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread])

  function pickFile(e) {
    const f = e.target.files?.[0]
    if (f) setPendingFile(f)
    e.target.value = ''
  }

  async function send(e) {
    e.preventDefault()
    if ((!draft.trim() && !pendingFile) || !active) return
    setSending(true)
    try {
      let fileId = null
      if (pendingFile) {
        const uploaded = await api.uploadFile(pendingFile, null, 'message')
        fileId = uploaded.id
      }
      await api.sendMessage(active.user_id, draft.trim(), fileId)
      setDraft('')
      setPendingFile(null)
      const msgs = await api.getThread(active.user_id)
      setThread(Array.isArray(msgs) ? msgs : [])
      loadConversations()
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <Loading label="טוען הודעות…" />
  if (error) return <ErrorBox error={error} onRetry={() => window.location.reload()} />

  // Merge conversations + startable contacts into one sidebar list (dedup by id).
  const convoIds = new Set(conversations.map((c) => c.user_id))
  const startable = contacts.filter((c) => !convoIds.has(c.user_id))

  return (
    <section dir="rtl" className="messages-page">
      <div className="page-head">
        <div>
          <h1>הודעות</h1>
          <p className="muted">
            {isAdmin ? 'התכתבות עם התלמידים' : 'התכתבות עם צוות ההוראה'}
          </p>
        </div>
        {isAdmin && (
          <motion.button
            type="button"
            className="btn-ghost broadcast-open-btn"
            onClick={() => { setBcFlash(null); setBcOpen(true) }}
            {...tapScale}
          >
            <IconUsers width={18} height={18} />
            הודעת תפוצה
          </motion.button>
        )}
      </div>

      {bcFlash && (
        <p className="broadcast-flash" role="status">{bcFlash}</p>
      )}

      {bcOpen && (
        <BroadcastModal
          students={contacts}
          onClose={() => setBcOpen(false)}
          onSent={(n) => {
            setBcOpen(false)
            setBcFlash(`ההודעה נשלחה ל-${n} תלמידים.`)
            loadConversations()
          }}
        />
      )}

      <div className={'chat-layout card' + (active ? ' has-active' : '')}>
        {/* Sidebar — a plain (non-motion) element: the mobile slide-over
            transform on .chat-sidebar comes from a CSS class (.has-active,
            see comms-files-shared.css), and a motion component would fight
            that by imperatively re-asserting its own (identity) transform
            on every render, permanently overriding the CSS translateX. The
            entrance stagger instead lives on an inner motion.div. */}
        <aside className="chat-sidebar">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {conversations.length === 0 && startable.length === 0 && (
            <p className="muted empty-msg">אין עדיין שיחות.</p>
          )}
          {conversations.map((c) => (
            <motion.button
              key={`c-${c.user_id}`}
              variants={fadeInUp}
              className={
                'chat-contact' + (active?.user_id === c.user_id ? ' active' : '')
              }
              onClick={() => openThread({ user_id: c.user_id, full_name: c.full_name })}
              whileTap={{ scale: 0.98 }}
            >
              <span className="chat-contact-name">{c.full_name}</span>
              <span className="chat-contact-last">{c.last_body}</span>
              {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
            </motion.button>
          ))}

          {startable.length > 0 && (
            <>
              <div className="chat-sidebar-label">התחל שיחה חדשה</div>
              {startable.map((c) => (
                <motion.button
                  key={`s-${c.user_id}`}
                  variants={fadeInUp}
                  className={
                    'chat-contact new' +
                    (active?.user_id === c.user_id ? ' active' : '')
                  }
                  onClick={() => openThread(c)}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="chat-contact-name">{c.full_name}</span>
                  <span className="chat-contact-last muted">שלח הודעה ראשונה…</span>
                </motion.button>
              ))}
            </>
          )}
        </motion.div>
        </aside>

        {/* Thread */}
        <div className="chat-main">
          {!active ? (
            <div className="chat-empty">בחרו שיחה מהרשימה כדי להתחיל.</div>
          ) : (
            <>
              <div className="chat-thread-head">
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={() => setActive(null)}
                  aria-label="חזרה לרשימת השיחות"
                >
                  <IconArrowStart style={{ transform: 'scaleX(-1)' }} />
                </button>
                {active.full_name}
              </div>
              <div className="chat-messages">
                {thread.length === 0 && (
                  <p className="muted chat-empty">אין הודעות עדיין — כתבו הודעה.</p>
                )}
                <AnimatePresence initial={false}>
                  {thread.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: DURATION.medium, ease: EASE_OUT }}
                      className={
                        'chat-bubble ' +
                        (m.sender_id === user.id ? 'mine' : 'theirs')
                      }
                    >
                      {m.attachment && <Attachment file={m.attachment} />}
                      {m.body && <div className="chat-bubble-body">{m.body}</div>}
                      <div className="chat-bubble-time">
                        {new Date(m.created_at).toLocaleString('he-IL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={threadEnd} />
              </div>
              {pendingFile && (
                <div className="chat-pending-file">
                  <span className="chat-attachment-icon"><IconPaperclip /></span>
                  <span className="chat-attachment-name">{pendingFile.name}</span>
                  <button
                    type="button"
                    className="chat-pending-file-remove"
                    onClick={() => setPendingFile(null)}
                    aria-label="הסר קובץ"
                  >
                    <IconX />
                  </button>
                </div>
              )}
              <form className="chat-compose" onSubmit={send}>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={pickFile}
                  style={{ display: 'none' }}
                />
                <motion.button
                  type="button"
                  className="chat-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="צרף קובץ או תמונה"
                  {...tapScale}
                >
                  <IconPaperclip width={20} height={20} />
                </motion.button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתבו הודעה…"
                  disabled={sending}
                />
                <motion.button
                  className="btn"
                  disabled={sending || (!draft.trim() && !pendingFile)}
                  {...tapScale}
                >
                  שלח
                </motion.button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
