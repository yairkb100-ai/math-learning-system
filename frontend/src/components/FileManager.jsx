import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox, friendlyError } from './Status.jsx'
import { EmptyState } from './StudentUi.jsx'
import { IconFile, IconPencil, IconPlay, IconDownload, IconUpload, IconX, IconBook } from './icons.jsx'
import { tapScale } from '../lib/motion.js'
import '../styles/comms-files-shared.css'

function humanSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// שמות הקבצים נוצרים אוטומטית ("דף-עבודה-פרק-2-ריבוע-של-סכום.pdf"). לתלמיד זה
// נקרא כמו שם קובץ במחשב; כאן מפרקים אותו לכותרת + סוג + פרק. לתצוגה בלבד —
// ההורדה ממשיכה להשתמש בשם המקורי.
const KIND_PREFIXES = [
  ['דף-תרגול-מסכם', 'דף תרגול מסכם'],
  ['דף-עבודה', 'דף עבודה'],
  ['מאגר-שאלות', 'מאגר שאלות'],
  ['סרטון', 'סרטון'],
]

export function describeFile(f) {
  const raw = String(f.original_name || '')
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(raw)?.[1] || '').toLowerCase()
  let base = ext ? raw.slice(0, -(ext.length + 1)) : raw
  const isVideo = ['mp4', 'webm', 'mov'].includes(ext) || /^video\//.test(f.content_type || '')

  let kind = isVideo ? 'סרטון' : ''
  for (const [prefix, label] of KIND_PREFIXES) {
    if (base.startsWith(prefix)) {
      kind = label
      base = base.slice(prefix.length).replace(/^-+/, '')
      break
    }
  }
  const ch = /(?:^|-)פרק-(\d+)(?:-|$)/.exec(base)
  const chapter = ch ? Number(ch[1]) : null
  if (ch) base = (base.slice(0, ch.index) + '-' + base.slice(ch.index + ch[0].length)).replace(/^-+|-+$/g, '')
  const title = base.replace(/[-_]+/g, ' ').trim()
  return {
    title: title || kind || raw,
    kind,
    chapter,
    ext: ext.toUpperCase(),
    isVideo,
  }
}

const GENERAL = 'general'
const MINE = 'mine'

// Reusable file list widget. Pass a courseId to scope files to a course, or
// omit for the shared/global file area. Uploading course resources is
// admin-only — students submit files only through the homework flow
// (see HomeworkBox in ChapterView).
export default function FileManager({ courseId = null, title = 'קבצים' }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const isAdmin = user?.role === 'admin'

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .listFiles(courseId)
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [courseId])

  useEffect(() => {
    load()
  }, [load])

  // שמות הקורסים — רק לכותרות הקבוצות; בלי זה הקבוצה נקראת "קורס".
  useEffect(() => {
    if (courseId != null) return
    api
      .listCourses()
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]))
  }, [courseId])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setNotice(null)
    try {
      await api.uploadFile(file, courseId)
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (err) {
      setNotice(`ההעלאה נכשלה. ${friendlyError(err)}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(f) {
    if (!confirm(`למחוק את הקובץ "${f.original_name}"?`)) return
    setNotice(null)
    try {
      await api.deleteFile(f.id)
      load()
    } catch (err) {
      setNotice(`המחיקה נכשלה. ${friendlyError(err)}`)
    }
  }

  async function handleDownload(f) {
    setNotice(null)
    try {
      await api.downloadFile(f.id, f.original_name, f.external_url)
    } catch (err) {
      setNotice(`ההורדה לא הצליחה. ${friendlyError(err)}`)
    }
  }

  const canDelete = (f) => f.uploader_id === user?.id || isAdmin

  const groups = useMemo(() => {
    const titles = new Map(courses.map((c) => [c.id, c.title]))
    const q = query.trim().toLowerCase()
    const byKey = new Map()
    for (const f of files) {
      const info = describeFile(f)
      const key = f.kind === 'homework' ? MINE : f.course_id ?? GENERAL
      const groupTitle =
        key === MINE
          ? isAdmin
            ? 'הגשות של תלמידים'
            : 'ההגשות שלי'
          : key === GENERAL
          ? 'חומרים כלליים'
          : titles.get(key) || 'קורס'
      if (q) {
        const hay = `${info.title} ${info.kind} ${groupTitle} ${f.original_name}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      if (!byKey.has(key)) byKey.set(key, { key, title: groupTitle, items: [] })
      byKey.get(key).items.push({ f, info })
    }
    const list = [...byKey.values()]
    for (const g of list) {
      g.items.sort(
        (a, b) =>
          (a.info.chapter ?? 0) - (b.info.chapter ?? 0) ||
          a.info.kind.localeCompare(b.info.kind, 'he') ||
          a.info.title.localeCompare(b.info.title, 'he')
      )
    }
    // ההגשות שלי קודם, אחר כך הקורסים לפי סדר הקטלוג, והכללי בסוף.
    const order = new Map(courses.map((c, i) => [c.id, i]))
    const rank = (g) => (g.key === MINE ? -1 : g.key === GENERAL ? 1e6 : order.get(g.key) ?? 1e5)
    return list.sort((a, b) => rank(a) - rank(b))
  }, [files, courses, query, isAdmin])

  const shownCount = groups.reduce((n, g) => n + g.items.length, 0)
  const searching = query.trim() !== ''

  return (
    <div className="card file-manager" dir="rtl">
      <div className="file-manager-head">
        <h2 className="fm-title">
          {title}
          {!loading && !error && files.length > 0 && (
            <span className="fm-count">{files.length} קבצים</span>
          )}
        </h2>
        {isAdmin && (
          <motion.label className="btn btn-cta file-upload-btn" {...tapScale}>
            <IconUpload width={16} height={16} />
            {uploading ? 'מעלה…' : 'העלאת קובץ'}
            <input
              ref={inputRef}
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
          </motion.label>
        )}
      </div>

      {notice && (
        <p className="fm-notice" role="alert">
          {notice}
        </p>
      )}

      {loading ? (
        <Loading label="טוען קבצים…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : files.length === 0 ? (
        <EmptyState
          icon={<IconFile />}
          title="עדיין אין כאן קבצים"
          actions={
            !isAdmin && (
              <Link to="/lomda" className="btn">
                לקורסים
              </Link>
            )
          }
        >
          <p>
            דפי עבודה, מאגרי שאלות וסרטונים של הקורסים יופיעו כאן להורדה. בינתיים
            הכול זמין גם בתוך הפרקים עצמם.
          </p>
        </EmptyState>
      ) : (
        <>
          {files.length > 8 && (
            <div className="fm-search">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי קורס, נושא או סוג קובץ"
                aria-label="חיפוש בקבצים"
              />
              {searching && (
                <span className="fm-search-count" aria-live="polite">
                  {shownCount === 0 ? 'אין תוצאות' : `${shownCount} תוצאות`}
                </span>
              )}
            </div>
          )}

          {shownCount === 0 ? (
            <EmptyState compact title="לא נמצא קובץ שמתאים לחיפוש">
              <p>
                אפשר לנסות מילה אחרת, או{' '}
                <button type="button" className="fm-link" onClick={() => setQuery('')}>
                  לנקות את החיפוש
                </button>
                .
              </p>
            </EmptyState>
          ) : (
            <div className="fm-groups">
              {groups.map((g) => (
                <details
                  key={`${g.key}-${searching ? 's' : 'a'}`}
                  className="fm-group"
                  open={searching || groups.length === 1 || g.key === MINE}
                >
                  <summary>
                    <span className="fm-group-icon" aria-hidden="true">
                      {g.key === MINE ? <IconPencil /> : <IconBook />}
                    </span>
                    <span className="fm-group-title">{g.title}</span>
                    <span className="fm-group-count">
                      {g.items.length === 1 ? 'קובץ אחד' : `${g.items.length} קבצים`}
                    </span>
                  </summary>
                  <ul className="file-list">
                    {g.items.map(({ f, info }) => (
                      <li key={f.id} className="file-row">
                        <span className="file-icon" aria-hidden="true">
                          {f.kind === 'homework' ? (
                            <IconPencil />
                          ) : info.isVideo ? (
                            <IconPlay />
                          ) : (
                            <IconFile />
                          )}
                        </span>
                        <span className="file-name">
                          <span className="fm-file-title">{info.title}</span>
                          <span className="fm-file-meta">
                            {[
                              f.kind === 'homework'
                                ? `הגשה${f.uploader_name && isAdmin ? ` · ${f.uploader_name}` : ''}`
                                : info.kind,
                              info.chapter != null ? `פרק ${info.chapter}` : null,
                              info.ext,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            {f.size != null && (
                              <>
                                {' · '}
                                <span dir="ltr">{humanSize(f.size)}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="file-actions">
                          <motion.button
                            className="btn-sm"
                            onClick={() => handleDownload(f)}
                            aria-label={`הורדת ${info.title}`}
                            {...tapScale}
                          >
                            <IconDownload width={15} height={15} /> הורדה
                          </motion.button>
                          {canDelete(f) && (
                            <motion.button
                              className="btn-sm btn-danger"
                              onClick={() => handleDelete(f)}
                              aria-label={`מחיקת ${info.title}`}
                              {...tapScale}
                            >
                              <IconX width={15} height={15} /> מחיקה
                            </motion.button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
