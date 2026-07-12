export function Loading({ label = 'Loading…' }) {
  return (
    <div className="status">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="status error">
      <p>⚠️ {String(error?.message || error)}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
