import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../api.js'
import { Loading, ErrorBox } from './Status.jsx'

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
          <label className="btn btn-cta file-upload-btn">
            {uploading ? 'מעלה…' : '⬆ העלה קובץ'}
            <input
              ref={inputRef}
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
          </label>
        )}
      </div>

      {loading ? (
        <Loading label="טוען קבצים…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : files.length === 0 ? (
        <p className="muted empty-msg">אין קבצים עדיין.</p>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.id} className="file-row">
              <span className="file-icon">{f.kind === 'homework' ? '📝' : '📄'}</span>
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
                <button
                  className="btn-sm"
                  onClick={() =>
                    api.downloadFile(f.id, f.original_name, f.external_url)
                  }
                >
                  הורדה
                </button>
                {canDelete(f) && (
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => handleDelete(f)}
                  >
                    מחק
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
