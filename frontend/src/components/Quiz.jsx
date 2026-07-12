import { useState } from 'react'
import api from '../api.js'
import MathText, { InlineMathText } from './MathText.jsx'

const t = (rtl, he, en) => (rtl ? he : en)

export default function Quiz({ questions, chapterId, rtl }) {
  return (
    <div className="quiz">
      {questions.map((q) => (
        <QuizQuestion
          key={q.number}
          question={q}
          chapterId={chapterId}
          rtl={rtl}
        />
      ))}
    </div>
  )
}

function QuizQuestion({ question, chapterId, rtl }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null) // { correct, correct_answer }
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

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
    <div
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
            <label key={i} className="option">
              <input
                type="radio"
                name={`q-${chapterId}-${question.number}`}
                value={opt}
                checked={answer === opt}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={loading}
              />
              <span><InlineMathText text={opt} /></span>
            </label>
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
        <button className="btn" onClick={submit} disabled={loading || !answer}>
          {loading ? t(rtl, 'בודק…', 'Checking…') : t(rtl, 'בדוק', 'Check')}
        </button>
      </div>

      {err && <p className="inline-error">⚠️ {String(err.message || err)}</p>}

      {result && (
        <div className={'verdict ' + (result.correct ? 'ok' : 'no')}>
          {result.correct ? (
            <strong>✓ {t(rtl, 'תשובה נכונה!', 'Correct!')}</strong>
          ) : (
            <>
              <strong>✗ {t(rtl, 'לא נכון.', 'Incorrect.')}</strong>
              {result.correct_answer != null && (
                <span className="correct-answer">
                  {t(rtl, 'התשובה הנכונה: ', 'Correct answer: ')}
                  <InlineMathText text={result.correct_answer} />
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
