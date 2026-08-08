import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import PrivateRoute from './components/PrivateRoute.jsx'
import Navbar from './components/Navbar.jsx'
import BookLessonFab from './components/BookLessonFab.jsx'
import InviteFab from './components/InviteFab.jsx'
import UpdateBar from './components/UpdateBar.jsx'
import TrialWelcome from './components/TrialWelcome.jsx'
import Celebration from './components/Celebration.jsx'

import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import CourseList from './pages/CourseList.jsx'
import CourseView from './pages/CourseView.jsx'
import ChapterView from './pages/ChapterView.jsx'
import StudentProgress from './pages/StudentProgress.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import AdminCourses from './pages/AdminCourses.jsx'
import AdminProgress from './pages/AdminProgress.jsx'
import AdminSections from './pages/AdminSections.jsx'
import AdminBilling from './pages/AdminBilling.jsx'
import AdminChapterViews from './pages/AdminChapterViews.jsx'
import Messages from './pages/Messages.jsx'
import FilesPage from './pages/FilesPage.jsx'
import SubscriptionPage from './pages/SubscriptionPage.jsx'
import Practice from './pages/Practice.jsx'
import Analytics from './pages/Analytics.jsx'
import Exams from './pages/Exams.jsx'
import ExamPlayer from './pages/ExamPlayer.jsx'
import ExamResults from './pages/ExamResults.jsx'
import Achievements from './pages/Achievements.jsx'
import LessonsBooking from './pages/LessonsBooking.jsx'
import AdminLessons from './pages/AdminLessons.jsx'
import ReferralPage from './pages/ReferralPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function AppRoutes() {
  return (
    <div className="app">
      <Navbar />

      <main className="content">
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* קישור ההזמנה ששותפו בוואטסאפ — קצר ובלי סימן שאלה, כדי שאפליקציות
              לא יחתכו אותו. מכאן הוא נכנס לטופס ההרשמה כפרמטר. */}
          <Route path="/join/:code" element={<JoinRedirect />} />

          {/* Student */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <CourseList />
              </PrivateRoute>
            }
          />
          <Route
            path="/courses/:id"
            element={
              <PrivateRoute>
                <CourseView />
              </PrivateRoute>
            }
          />
          <Route
            path="/courses/:id/chapters/:number"
            element={
              <PrivateRoute>
                <ChapterView />
              </PrivateRoute>
            }
          />
          <Route
            path="/progress"
            element={
              <PrivateRoute>
                <StudentProgress />
              </PrivateRoute>
            }
          />
          <Route
            path="/practice"
            element={
              <PrivateRoute>
                <Practice />
              </PrivateRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <PrivateRoute>
                <Analytics />
              </PrivateRoute>
            }
          />
          <Route
            path="/exams"
            element={
              <PrivateRoute>
                <Exams />
              </PrivateRoute>
            }
          />
          <Route
            path="/exams/:id"
            element={
              <PrivateRoute>
                <ExamPlayer />
              </PrivateRoute>
            }
          />
          <Route
            path="/exam-results/:id"
            element={
              <PrivateRoute>
                <ExamResults />
              </PrivateRoute>
            }
          />
          <Route
            path="/achievements"
            element={
              <PrivateRoute>
                <Achievements />
              </PrivateRoute>
            }
          />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <PrivateRoute adminOnly>
                <AdminDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <PrivateRoute adminOnly>
                <AdminUsers />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/courses"
            element={
              <PrivateRoute adminOnly>
                <AdminCourses />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/progress"
            element={
              <PrivateRoute adminOnly>
                <AdminProgress />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/sections"
            element={
              <PrivateRoute adminOnly>
                <AdminSections />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <PrivateRoute adminOnly>
                <AdminBilling />
              </PrivateRoute>
            }
          />
          <Route path="/admin/devices" element={<Navigate to="/admin/subscriptions" replace />} />
          <Route
            path="/admin/chapter-views"
            element={
              <PrivateRoute adminOnly>
                <AdminChapterViews />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/lessons"
            element={
              <PrivateRoute adminOnly>
                <AdminLessons />
              </PrivateRoute>
            }
          />

          {/* Shared (any logged-in user) */}
          <Route
            path="/messages"
            element={
              <PrivateRoute>
                <Messages />
              </PrivateRoute>
            }
          />
          <Route
            path="/files"
            element={
              <PrivateRoute>
                <FilesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/subscription"
            element={
              <PrivateRoute>
                <SubscriptionPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/lessons"
            element={
              <PrivateRoute>
                <LessonsBooking />
              </PrivateRoute>
            }
          />
          <Route
            path="/invite"
            element={
              <PrivateRoute>
                <ReferralPage />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <BookLessonFab />
      <InviteFab />
      <UpdateBar />
      <TrialWelcome />
      <Celebration />

      <footer className="footer" dir="rtl">
        <span>© יאיר כהנא 0545953631</span>
      </footer>
    </div>
  )
}

// /join/<קוד> → טופס ההרשמה עם הקוד. הקוד מנורמל לאותיות גדולות כי הוא מוקלד
// ומועתק ידנית, ו-replace כדי שכפתור "אחורה" לא יחזיר אותנו להפניה.
function JoinRedirect() {
  const { code } = useParams()
  return <Navigate to={`/register?ref=${encodeURIComponent((code || '').toUpperCase())}`} replace />
}

function NotFound() {
  return (
    <div className="card" dir="rtl" style={{ marginTop: 40, textAlign: 'center' }}>
      <h2>404</h2>
      <p>הדף לא נמצא.</p>
      <a href="/">← חזרה לדף הבית</a>
    </div>
  )
}
