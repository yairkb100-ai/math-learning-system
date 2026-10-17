import MathText, { isLatinText } from './MathText.jsx'

// כרטיס סקירה של שאלה אחת בסיכום של מבחן ללא זמן / סבב תרגול: השאלה, כל
// התשובות עם סימון הבחירה והמפתח, ההסבר (גלוי תמיד) והפתרון (מקופל).
// הנתונים כולם נאספו אחרי שהתלמיד כבר שלח תשובה — אין כאן דליפה מוקדמת.
const OPTION_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח']

export default function PsyReviewItem({ n, item, chosen, result, seconds }) {
  const key = result.correct_index
  const ok = !!result.is_correct
  return (
    <li className={`psy-review-item${ok ? ' is-correct' : ' is-wrong'}`}>
      <div className="psy-review-meta">
        <strong className={`psy-review-verdict${ok ? ' is-ok' : ' is-no'}`}>
          שאלה {n} · {ok ? 'נכון' : 'לא נכון'}
        </strong>
        {item.topic && <span>{item.topic}</span>}
        {seconds != null && (
          <span className={item.target_seconds && seconds > item.target_seconds ? 'is-slow' : ''}>
            {seconds} שנ׳{item.target_seconds ? ` (יעד ${item.target_seconds})` : ''}
          </span>
        )}
      </div>
      {item.passage && (
        <details className="psy-review-passage">
          <summary>הצג את קטע הקריאה</summary>
          <div className={isLatinText(item.passage.body) ? 'psy-passage-ltr' : undefined}>
            <MathText text={item.passage.body} />
          </div>
        </details>
      )}
      <div className="psy-stem">
        <MathText text={item.stem} />
      </div>
      {item.figure && (
        <div className="psy-figure">
          <MathText text={item.figure} />
        </div>
      )}
      <ul className="psy-review-options">
        {item.options.map((opt, i) => (
          <li
            key={i}
            className={[
              'psy-review-option',
              i === key ? 'is-key' : '',
              i === chosen && i !== key ? 'is-yours' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="psy-option-letter">{OPTION_LETTERS[i]}</span>
            <MathText text={opt} plain />
            {i === key && <span className="psy-tag">התשובה הנכונה</span>}
            {i === chosen && i !== key && <span className="psy-tag psy-tag-bad">התשובה שלך</span>}
          </li>
        ))}
      </ul>
      {result.explanation && (
        <div className="psy-explanation">
          <MathText text={result.explanation} />
        </div>
      )}
      {result.solution && (
        <details className="psy-solution">
          <summary>איך חושבים על זה</summary>
          <MathText text={result.solution} />
        </details>
      )}
    </li>
  )
}
