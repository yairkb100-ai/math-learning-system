import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

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
      <span className="chat-attachment-icon">📎</span>
      <span className="chat-attachment-name">{file.original_name}</span>
      <span className="chat-attachment-size muted">{formatSize(file.size)}</span>
    </button>
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
    <section dir="rtl">
      <div className="page-head">
        <h1>הודעות</h1>
        <p className="muted">
          {isAdmin ? 'התכתבות עם התלמידים' : 'התכתבות עם צוות ההוראה'}
        </p>
      </div>

      <div className="chat-layout card">
        {/* Sidebar */}
        <aside className="chat-sidebar">
          {conversations.length === 0 && startable.length === 0 && (
            <p className="muted empty-msg">אין עדיין שיחות.</p>
          )}
          {conversations.map((c) => (
            <button
              key={`c-${c.user_id}`}
              className={
                'chat-contact' + (active?.user_id === c.user_id ? ' active' : '')
              }
              onClick={() => openThread({ user_id: c.user_id, full_name: c.full_name })}
            >
              <span className="chat-contact-name">{c.full_name}</span>
              <span className="chat-contact-last">{c.last_body}</span>
              {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
            </button>
          ))}

          {startable.length > 0 && (
            <>
              <div className="chat-sidebar-label">התחל שיחה חדשה</div>
              {startable.map((c) => (
                <button
                  key={`s-${c.user_id}`}
                  className={
                    'chat-contact new' +
                    (active?.user_id === c.user_id ? ' active' : '')
                  }
                  onClick={() => openThread(c)}
                >
                  <span className="chat-contact-name">{c.full_name}</span>
                  <span className="chat-contact-last muted">שלח הודעה ראשונה…</span>
                </button>
              ))}
            </>
          )}
        </aside>

        {/* Thread */}
        <div className="chat-main">
          {!active ? (
            <div className="chat-empty">בחרו שיחה מהרשימה כדי להתחיל.</div>
          ) : (
            <>
              <div className="chat-thread-head">{active.full_name}</div>
              <div className="chat-messages">
                {thread.length === 0 && (
                  <p className="muted chat-empty">אין הודעות עדיין — כתבו הודעה.</p>
                )}
                {thread.map((m) => (
                  <div
                    key={m.id}
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
                  </div>
                ))}
                <div ref={threadEnd} />
              </div>
              {pendingFile && (
                <div className="chat-pending-file">
                  <span className="chat-attachment-icon">📎</span>
                  <span className="chat-attachment-name">{pendingFile.name}</span>
                  <button
                    type="button"
                    className="chat-pending-file-remove"
                    onClick={() => setPendingFile(null)}
                    aria-label="הסר קובץ"
                  >
                    ✕
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
                <button
                  type="button"
                  className="chat-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="צרף קובץ או תמונה"
                >
                  📎
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתבו הודעה…"
                  disabled={sending}
                />
                <button className="btn" disabled={sending || (!draft.trim() && !pendingFile)}>
                  שלח
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
