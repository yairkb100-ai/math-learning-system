import FileManager from '../components/FileManager.jsx'

export default function FilesPage() {
  return (
    <section dir="rtl">
      <div className="page-head">
        <h1>קבצים משותפים</h1>
        <p className="muted">
          כאן ניתן להעלות ולהוריד קבצים — חומרי לימוד מהמורה או הגשות מהתלמיד.
        </p>
      </div>
      <FileManager title="כל הקבצים" />
    </section>
  )
}
