import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import LoginPage from './pages/LoginPage'
import CoachLayout from './pages/coach/CoachLayout'
import Dashboard from './pages/coach/Dashboard'
import Students from './pages/coach/Students'
import StudentProfile from './pages/coach/StudentProfile'
import WorkoutBuilder from './pages/coach/WorkoutBuilder'
import WorkoutList from './pages/coach/WorkoutList'
import DietList from './pages/coach/DietList'
import Feedbacks from './pages/coach/Feedbacks'
import Questionnaires from './pages/coach/Questionnaires'
import StudentEvolution from './pages/coach/StudentEvolution'
import SessionHistory from './pages/coach/SessionHistory'
import DietBuilder from './pages/coach/DietBuilder'
import Assessments from './pages/coach/Assessments'
import Chat from './pages/coach/Chat'
import Payments from './pages/coach/Payments'
import AutoMessages from './pages/coach/AutoMessages'
import CoachProfile from './pages/coach/CoachProfile'
import Leads from './pages/coach/Leads'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import ExerciseLibrary from './pages/admin/ExerciseLibrary'
import WorkoutTemplates from './pages/admin/WorkoutTemplates'
import TemplateBuilder from './pages/admin/TemplateBuilder'
import Coaches from './pages/admin/Coaches'
import SupportChat from './pages/admin/SupportChat'
import ActivityLogs from './pages/admin/ActivityLogs'
import Settings from './pages/admin/Settings'
import StudentLayout from './pages/student/StudentLayout'
import StudentHome from './pages/student/StudentHome'
import StudentWorkout from './pages/student/StudentWorkout'
import StudentWorkoutExecute from './pages/student/StudentWorkoutExecute'
import StudentWorkoutFeedback from './pages/student/StudentWorkoutFeedback'
import StudentWorkoutSummary from './pages/student/StudentWorkoutSummary'
import StudentDiet from './pages/student/StudentDiet'
import StudentChat from './pages/student/StudentChat'
import StudentPayments from './pages/student/StudentPayments'
import StudentProfilePage from './pages/student/StudentProfile'
import StudentSessions from './pages/student/StudentSessions'
import StudentAssessments from './pages/student/StudentAssessments'
import StudentQuestionnaires from './pages/student/StudentQuestionnaires'

function PrivateRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[#E8FF00] border-t-transparent rounded-full" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { initAuth } = useAuthStore()
  useEffect(() => { initAuth() }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Painel do Coach */}
      <Route path="/coach" element={
        <PrivateRoute allowedRoles={['coach', 'super_admin']}>
          <CoachLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentProfile />} />
        <Route path="students/:id/workouts" element={<WorkoutList />} />
        <Route path="students/:id/workout/new" element={<WorkoutBuilder />} />
        <Route path="students/:id/workout/:workoutId/edit" element={<WorkoutBuilder />} />
        <Route path="students/:id/diets" element={<DietList />} />
        <Route path="students/:id/evolution" element={<StudentEvolution />} />
        <Route path="students/:id/sessions" element={<SessionHistory />} />

        <Route path="students/:id/diet/new" element={<DietBuilder />} />
        <Route path="students/:id/diet/:dietId/edit" element={<DietBuilder />} />
        <Route path="assessments" element={<Assessments />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:studentId" element={<Chat />} />
        <Route path="feedbacks" element={<Feedbacks />} />
        <Route path="questionnaires" element={<Questionnaires />} />
        <Route path="payments" element={<Payments />} />
        <Route path="leads" element={<Leads />} />
        <Route path="auto-messages" element={<AutoMessages />} />
        <Route path="profile" element={<CoachProfile />} />
      </Route>

      {/* Painel Super Admin */}
      <Route path="/admin" element={
        <PrivateRoute allowedRoles={['super_admin']}>
          <AdminLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="coaches" element={<Coaches />} />
        <Route path="exercises" element={<ExerciseLibrary />} />
        <Route path="templates" element={<WorkoutTemplates />} />
        <Route path="templates/:templateId/build" element={<TemplateBuilder />} />
        <Route path="support" element={<SupportChat />} />
        <Route path="activity" element={<ActivityLogs />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Painel do Aluno */}
      <Route path="/student" element={
        <PrivateRoute allowedRoles={['student']}>
          <StudentLayout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<StudentHome />} />
        <Route path="workout" element={<StudentWorkout />} />
        <Route path="workout/execute/:dayId" element={<StudentWorkoutExecute />} />
        <Route path="workout/feedback/:sessionId" element={<StudentWorkoutFeedback />} />
        <Route path="workout/summary/:sessionId" element={<StudentWorkoutSummary />} />
        <Route path="diet" element={<StudentDiet />} />
        <Route path="chat" element={<StudentChat />} />
        <Route path="payments" element={<StudentPayments />} />
        <Route path="sessions" element={<StudentSessions />} />
        <Route path="assessments" element={<StudentAssessments />} />
        <Route path="questionnaires" element={<StudentQuestionnaires />} />
        <Route path="profile" element={<StudentProfilePage />} />
      </Route>

      <Route path="/" element={<Navigate to="/coach/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
