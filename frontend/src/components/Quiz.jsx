import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api.js'
import MathText, { InlineMathText } from './MathText.jsx'
import { celebrate } from '../lib/celebrate.js'
import { fadeInUp, staggerContainer, tapScale, DURATION, EASE_OUT } from '../lib/motion.js'
import '../styles/quiz.css'

const t = (rtl, he, en) => (rtl ? he : en)

// An answer option that is nothing but an illustration token, e.g.
// "{{figcell:shape=star,n=3}}" — the figural questions answer with a drawing,
// not with words.
const ART_ONLY = /^\s*\{\{[a-z-]+(?::[^|}]+)?(?:\|(?:[^}]|\}(?!\}))*)?\}\}\s*$/

/** Renders an option, drawing it when the option IS a figure.
 *
 * InlineMathText deliberately strips art tokens out of running prose, so an
 * option like "{{figcell:…}}" used to render as an empty label — which made
 * shape-answer questions unanswerable. MathText's block path is the one that
 * actually draws a token, so art-only options go through that instead.
 */
function OptionText({ text }) {
  if (ART_ONLY.test(String(text ?? ''))) {
    return <MathText text={text} />
  }
  return <InlineMathText text={text} />
}

export default function Quiz({ questions, chapterId, rtl }) {
  return (
    <motion.div
      className="quiz"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {questions.map((q) => (
        <QuizQuestion
          key={q.number}
          question={q}
          chapterId={chapterId}
          rtl={rtl}
        />
      ))}
    </motion.div>
  )
}

function QuizQuestion({ question, chapterId, rtl }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null) // { correct, correct_answer, explanation }
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (result?.correct) celebrate({ size: 'small' })
  }, [result])

  const trueFalse = question.type === 'true-false'
  const multiple = question.type === 'multiple-choice'
  const options = multiple
    ? question.options || []
    : trueFalse
      ? [t(rtl, 'נכון', 'True'), t(rtl, 'לא נכון', 'False')]
      : []

  const submit = () => {
    if (!answer && answer !== '0') return
    setLoading(true)
    setErr(null)
    api
      .checkQuiz({
        chapterId,
        questionNumber: question.number,
        answer,
      })
      .then(setResult)
      .catch(setErr)
      .finally(() => setLoading(false))
  }

  return (
    <motion.div
      variants={fadeInUp}
      className={
        'card quiz-q' +
        (result ? (result.correct ? ' is-correct' : ' is-wrong') : '')
      }
    >
      <div className="quiz-q-head">
        <span className="q-num">{question.number}</span>
        <div className="q-text">
          <MathText text={question.question} className="prose" />
        </div>
      </div>

      {options.length > 0 ? (
        <div className="options">
          {options.map((opt, i) => (
            <motion.label key={i} className="option" whileTap={{ scale: 0.98 }}>
              <input
                type="radio"
                name={`q-${chapterId}-${question.number}`}
                value={opt}
                checked={answer === opt}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={loading}
              />
              <span><OptionText text={opt} /></span>
            </motion.label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          className="text-answer"
          placeholder={t(rtl, 'התשובה שלך…', 'Your answer…')}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={loading}
        />
      )}

      <div className="quiz-actions">
        <motion.button
          className="btn"
          onClick={submit}
          disabled={loading || !answer}
          {...tapScale}
        >
          {loading ? t(rtl, 'בודק…', 'Checking…') : t(rtl, 'בדוק', 'Check')}
        </motion.button>
      </div>

      {err && <p className="inline-error">⚠️ {String(err.message || err)}</p>}

      <AnimatePresence>
        {result && (
          <motion.div
            key="verdict"
            className={'verdict ' + (result.correct ? 'ok' : 'no')}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: DURATION.medium, ease: EASE_OUT }}
          >
            {result.correct ? (
              <strong>✓ {t(rtl, 'תשובה נכונה!', 'Correct!')}</strong>
            ) : (
              <>
                <strong>✗ {t(rtl, 'לא נכון.', 'Incorrect.')}</strong>
                {result.correct_answer != null && (
                  <span className="correct-answer">
                    {t(rtl, 'התשובה הנכונה: ', 'Correct answer: ')}
                    <OptionText text={result.correct_answer} />
                  </span>
                )}
              </>
            )}
            {/* Shown on right answers too — a student who guessed right still
                needs the reasoning. */}
            {result.explanation && (
              <span className="quiz-explanation">
                <InlineMathText text={result.explanation} />
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
