import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from '../components/Status.jsx'

export default function Messages() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [conversations, setConversations] = useState([])
  const [contacts, setContacts] = useState([]) // people I can start a chat with
  const [active, setActive] = useState(null) // { user_id, full_name }
  const [thread, setThread] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const threadEnd = useRef(null)

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

  async function send(e) {
    e.preventDefault()
    if (!draft.trim() || !active) return
    setSending(true)
    try {
      await api.sendMessage(active.user_id, draft.trim())
      setDraft('')
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
                    <div className="chat-bubble-body">{m.body}</div>
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
              <form className="chat-compose" onSubmit={send}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתבו הודעה…"
                  disabled={sending}
                />
                <button className="btn" disabled={sending || !draft.trim()}>
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
