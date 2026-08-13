import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from './Status.jsx'
import { IconFile, IconPencil, IconDownload, IconUpload, IconX } from './icons.jsx'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_IN } from '../lib/motion.js'
import '../styles/comms-files-shared.css'

function humanSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Reusable file list widget. Pass a courseId to scope files to a course, or
// omit for the shared/global file area. Uploading course resources is
// admin-only — students submit files only through the homework flow
// (see HomeworkBox in ChapterView).
export default function FileManager({ courseId = null, title = 'קבצים' }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

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

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await api.uploadFile(file, courseId)
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(f) {
    if (!confirm(`למחוק את הקובץ "${f.original_name}"?`)) return
    try {
      await api.deleteFile(f.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const canDelete = (f) => f.uploader_id === user?.id || user?.role === 'admin'

  return (
    <div className="card file-manager" dir="rtl">
      <div className="file-manager-head">
        <h3>{title}</h3>
        {user?.role === 'admin' && (
          <motion.label className="btn btn-cta file-upload-btn" {...tapScale}>
            <IconUpload width={16} height={16} />
            {uploading ? 'מעלה…' : 'העלה קובץ'}
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

      {loading ? (
        <Loading label="טוען קבצים…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : files.length === 0 ? (
        <p className="muted empty-msg">אין קבצים עדיין.</p>
      ) : (
        <motion.ul
          className="file-list"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence initial={false}>
            {files.map((f) => (
              <motion.li
                key={f.id}
                className="file-row"
                variants={fadeInUp}
                exit={{ opacity: 0, x: 12, transition: { duration: DURATION.short, ease: EASE_IN } }}
                layout
              >
                <span className="file-icon">
                  {f.kind === 'homework' ? <IconPencil /> : <IconFile />}
                </span>
                <span className="file-name">
                  {f.original_name}
                  {f.kind === 'homework' && (
                    <span className="type-tag">
                      הגשה{f.uploader_name ? ` · ${f.uploader_name}` : ''}
                    </span>
                  )}
                </span>
                <span className="file-size muted">{humanSize(f.size)}</span>
                <span className="file-actions">
                  <motion.button
                    className="btn-sm"
                    onClick={() =>
                      api.downloadFile(f.id, f.original_name, f.external_url)
                    }
                    {...tapScale}
                  >
                    <IconDownload width={15} height={15} /> הורדה
                  </motion.button>
                  {canDelete(f) && (
                    <motion.button
                      className="btn-sm btn-danger"
                      onClick={() => handleDelete(f)}
                      {...tapScale}
                    >
                      <IconX width={15} height={15} /> מחק
                    </motion.button>
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  )
}
