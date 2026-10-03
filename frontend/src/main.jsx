import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import 'katex/dist/katex.min.css'
import './index.css'
// אחרי index.css בכוונה: שכבת הליטוש של מסלול הכניסה (נחיתה → הרשמה → קטלוג →
// קורס) דורסת כמה כללים משם בספציפיות שווה.
import './styles/first-impression.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
