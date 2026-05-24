export type UserRole = 'super_admin' | 'coach' | 'student'
export type PlanType = 'monthly' | 'quarterly' | 'semiannual' | 'annual'
export type PaymentStatus = 'active' | 'pending' | 'overdue' | 'blocked'
export type MessageType = 'text' | 'audio' | 'photo' | 'video'
export type AssessmentAngle = 'front' | 'left' | 'right' | 'back'
export type ExerciseRequestStatus = 'pending' | 'approved' | 'rejected'
export type BiologicalSex = 'male' | 'female'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'

export interface User {
  id: string
  email: string
  role: UserRole
  name: string
  phone?: string
  avatar_url?: string
  first_login: boolean
  created_at: string
}

export interface Coach {
  id: string
  user_id: string
  bio?: string
  created_by?: string
  created_at: string
  user?: User
}

export interface Student {
  id: string
  user_id: string
  coach_id: string
  plan_type: PlanType
  plan_start: string
  plan_end: string
  payment_status: PaymentStatus
  access_blocked: boolean
  asaas_customer_id?: string
  created_at: string
  user?: User
  coach?: Coach
}

export interface Anamnese {
  id: string
  student_id: string
  // Bloco A
  full_name: string
  birth_date: string
  biological_sex: BiologicalSex
  city?: string
  country?: string
  profession?: string
  // Bloco B
  goal: string
  current_weight: number
  height: number
  desired_weight?: number
  goal_months?: number
  // Bloco C
  has_disease: boolean
  disease_description?: string
  uses_medication: boolean
  medication_description?: string
  has_injury: boolean
  injury_description?: string
  has_limitation: boolean
  limitation_description?: string
  is_pregnant?: boolean
  // Bloco D
  has_allergy: boolean
  allergy_description?: string
  food_restrictions?: string
  meals_per_day?: number
  water_liters?: number
  alcohol_consumption?: 'none' | 'rarely' | '1_2_week' | '3_plus_week'
  // Bloco E
  sleep_hours?: number
  stress_level?: number
  work_type?: 'sedentary' | 'light' | 'moderate' | 'intense'
  has_busy_routine?: boolean
  preferred_workout_time?: 'morning' | 'afternoon' | 'evening' | 'variable'
  // Bloco F
  gym_experience?: 'never' | 'less_6mo' | '6mo_2yr' | 'more_2yr'
  practices_sport: boolean
  sport_description?: string
  fitness_level?: FitnessLevel
  // Calculados
  tmb?: number
  get_value?: number
  activity_factor?: number
  completed: boolean
  created_at: string
  updated_at: string
}

export interface Exercise {
  id: string
  name: string
  muscle_groups: string[]
  youtube_url?: string
  instructions?: string
  equipment?: string
  created_by: string
  active: boolean
  created_at: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  description?: string
  created_by: string
  active: boolean
  created_at: string
}

export interface Workout {
  id: string
  student_id: string
  coach_id: string
  name: string
  valid_from: string
  valid_to: string
  based_on_template_id?: string
  active: boolean
  created_at: string
  days?: WorkoutDay[]
}

export interface WorkoutDay {
  id: string
  workout_id: string
  name: string
  weekday_suggestion: number[]
  sort_order: number
  exercises?: WorkoutExercise[]
}

export interface WorkoutExercise {
  id: string
  workout_day_id: string
  exercise_id: string
  sets: number
  reps: string
  rest_seconds: number
  coach_notes?: string
  sort_order: number
  exercise?: Exercise
}

export interface TrainingSession {
  id: string
  student_id: string
  workout_day_id: string
  started_at: string
  finished_at?: string
  paused: boolean
  paused_at?: string
  duration_seconds?: number
  sets?: SessionSet[]
}

export interface SessionSet {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  weight_used?: number
  reps_done?: number
  completed_at: string
}

export interface TrainingFeedback {
  id: string
  session_id: string
  student_id: string
  fatigue_level: 1 | 2 | 3 | 4 | 5
  has_pain: boolean
  pain_description?: string
  notes?: string
  difficult_exercise_id?: string
  difficult_exercise_notes?: string
  read_by_coach: boolean
  created_at: string
}

export interface Diet {
  id: string
  student_id: string
  coach_id: string
  name: string
  valid_from: string
  valid_to: string
  active: boolean
  days?: DietDay[]
}

export interface DietDay {
  id: string
  diet_id: string
  label: string
  weekday: number[]
  sort_order: number
  calorie_goal?: number
  protein_goal?: number
  carbs_goal?: number
  fat_goal?: number
  meals?: Meal[]
}

export interface Meal {
  id: string
  diet_day_id: string
  name: string
  suggested_time?: string
  sort_order: number
  foods?: MealFood[]
}

export interface MealFood {
  id: string
  meal_id: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  sort_order: number
}

export interface DietLog {
  id: string
  student_id: string
  diet_day_id: string
  date: string
  meal_notes: Record<string, string>
}

export interface FoodCheck {
  id: string
  diet_log_id: string
  meal_food_id: string
  checked: boolean
  checked_at?: string
}

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  content?: string
  type: MessageType
  file_url?: string
  read_at?: string
  created_at: string
  sender?: User
}

export interface Assessment {
  id: string
  student_id: string
  coach_id: string
  weight: number
  height: number
  body_fat_pct?: number
  notes?: string
  read_by_coach: boolean
  created_at: string
  photos?: AssessmentPhoto[]
}

export interface AssessmentPhoto {
  id: string
  assessment_id: string
  angle: AssessmentAngle
  photo_url: string
}

export interface Payment {
  id: string
  student_id: string
  asaas_charge_id?: string
  amount: number
  status: string
  payment_method?: string
  due_date: string
  paid_at?: string
  plan_type: PlanType
  created_at: string
}
