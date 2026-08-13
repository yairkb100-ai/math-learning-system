import { motion } from 'framer-motion'
import FileManager from '../components/FileManager.jsx'
import { fadeInUp } from '../lib/motion.js'

export default function FilesPage() {
  return (
    <section dir="rtl">
      <motion.div
        className="page-head"
        variants={fadeInUp}
        initial="hidden"
        animate="show"
      >
        <h1>קבצים משותפים</h1>
        <p className="muted">
          כאן ניתן להעלות ולהוריד קבצים — חומרי לימוד מהמורה או הגשות מהתלמיד.
        </p>
      </motion.div>
      <FileManager title="כל הקבצים" />
    </section>
  )
}
