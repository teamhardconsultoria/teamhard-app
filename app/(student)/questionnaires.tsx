import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

type QuestionType = 'text' | 'number' | 'scale' | 'single' | 'multiple'

interface Question {
  id: string
  type: QuestionType
  text: string
  required: boolean
  options?: string[]
}

interface Assignment {
  id: string
  questionnaire_id: string
  due_date: string | null
  title: string
  questions: Question[]
  answered: boolean
  submitted_at: string | null
}

export default function QuestionnairesScreen() {
  const { user } = useAuthStore()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Assignment | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: student } = await supabase
      .from('students').select('id').eq('user_id', user!.id).single()
    if (!student) { setLoading(false); return }
    setStudentId(student.id)

    const { data: assigns } = await supabase
      .from('questionnaire_assignments')
      .select('id, questionnaire_id, due_date, questionnaire:questionnaires(title, questions)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })

    const { data: responses } = await supabase
      .from('questionnaire_responses')
      .select('questionnaire_id, submitted_at')
      .eq('student_id', student.id)

    const responseMap = new Map((responses || []).map(r => [r.questionnaire_id, r.submitted_at]))

    const list: Assignment[] = (assigns || []).map((a: any) => ({
      id: a.id,
      questionnaire_id: a.questionnaire_id,
      due_date: a.due_date,
      title: a.questionnaire.title,
      questions: a.questionnaire.questions,
      answered: responseMap.has(a.questionnaire_id),
      submitted_at: responseMap.get(a.questionnaire_id) || null,
    }))

    setAssignments(list)
    setLoading(false)
  }

  const openQuestionnaire = (a: Assignment) => {
    setSelected(a)
    setAnswers({})
  }

  const setAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const toggleMultiple = (questionId: string, option: string) => {
    const current: string[] = answers[questionId] || []
    const updated = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option]
    setAnswer(questionId, updated)
  }

  const handleSubmit = async () => {
    if (!selected || !studentId) return

    const unanswered = selected.questions.filter(
      q => q.required && (answers[q.id] === undefined || answers[q.id] === '' ||
        (Array.isArray(answers[q.id]) && answers[q.id].length === 0))
    )
    if (unanswered.length > 0) {
      Alert.alert('Atenção', `Responda todas as perguntas obrigatórias (${unanswered.length} pendente${unanswered.length > 1 ? 's' : ''}).`)
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('questionnaire_responses').insert({
      questionnaire_id: selected.questionnaire_id,
      student_id: studentId,
      answers,
    })

    if (error) {
      Alert.alert('Erro', error.message)
      setSubmitting(false)
      return
    }

    Alert.alert('Enviado!', 'Suas respostas foram registradas.', [
      { text: 'OK', onPress: () => { setSelected(null); load() } },
    ])
    setSubmitting(false)
  }

  // ── Answer view ──────────────────────────────────────────────────────────────

  if (selected) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{selected.title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
          {selected.questions.map((q, idx) => (
            <View key={`${q.id}-${idx}`} style={styles.questionCard}>
              <Text style={styles.questionNum}>Pergunta {idx + 1}{q.required ? ' *' : ''}</Text>
              <Text style={styles.questionText}>{q.text}</Text>

              {q.type === 'text' && (
                <TextInput
                  style={styles.textInput}
                  value={answers[q.id] || ''}
                  onChangeText={v => setAnswer(q.id, v)}
                  placeholder="Sua resposta..."
                  placeholderTextColor={colors.subtext}
                  multiline
                />
              )}

              {q.type === 'number' && (
                <TextInput
                  style={styles.textInput}
                  value={answers[q.id]?.toString() || ''}
                  onChangeText={v => setAnswer(q.id, v)}
                  placeholder="0"
                  placeholderTextColor={colors.subtext}
                  keyboardType="decimal-pad"
                />
              )}

              {q.type === 'scale' && (
                <View style={styles.scaleRow}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.scaleBtn, answers[q.id] === n && styles.scaleBtnActive]}
                      onPress={() => setAnswer(q.id, n)}
                    >
                      <Text style={[styles.scaleBtnText, answers[q.id] === n && styles.scaleBtnTextActive]}>
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {q.type === 'single' && (q.options || []).map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optionRow, answers[q.id] === opt && styles.optionRowActive]}
                  onPress={() => setAnswer(q.id, opt)}
                >
                  <View style={[styles.radio, answers[q.id] === opt && styles.radioActive]}>
                    {answers[q.id] === opt && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.optionText, answers[q.id] === opt && styles.optionTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}

              {q.type === 'multiple' && (q.options || []).map(opt => {
                const selected2 = (answers[q.id] || []).includes(opt)
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optionRow, selected2 && styles.optionRowActive]}
                    onPress={() => toggleMultiple(q.id, opt)}
                  >
                    <View style={[styles.checkbox, selected2 && styles.checkboxActive]}>
                      {selected2 && <Ionicons name="checkmark" size={12} color="#0A0A0A" />}
                    </View>
                    <Text style={[styles.optionText, selected2 && styles.optionTextActive]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={styles.submitText}>ENVIAR RESPOSTAS</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────────

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  const pending = assignments.filter(a => !a.answered)
  const done = assignments.filter(a => a.answered)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Questionários</Text>
        {pending.length > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pending.length} pendente{pending.length > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {assignments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="clipboard-outline" size={40} color={colors.subtext} />
          <Text style={styles.empty}>Nenhum questionário atribuído.</Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={a => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.answered && styles.cardDone]}
              onPress={() => !item.answered && openQuestionnaire(item)}
              activeOpacity={item.answered ? 1 : 0.7}
            >
              <View style={styles.cardLeft}>
                <View style={[styles.cardIcon, item.answered && styles.cardIconDone]}>
                  <Ionicons
                    name={item.answered ? 'checkmark-circle' : 'clipboard-outline'}
                    size={22}
                    color={item.answered ? '#0A0A0A' : colors.yellow}
                  />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, item.answered && styles.cardTitleDone]}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardSub}>
                    {item.answered
                      ? `Respondido em ${new Date(item.submitted_at!).toLocaleDateString('pt-BR')}`
                      : item.due_date
                        ? `Prazo: ${new Date(item.due_date).toLocaleDateString('pt-BR')}`
                        : `${item.questions.length} pergunta${item.questions.length !== 1 ? 's' : ''}`
                    }
                  </Text>
                </View>
              </View>
              {!item.answered && (
                <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  empty: { color: colors.subtext, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: colors.text, flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1 },
  pendingBadge: {
    backgroundColor: `${colors.yellow}20`, borderRadius: 10,
    borderWidth: 1, borderColor: `${colors.yellow}40`,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: colors.yellow },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  cardDone: { opacity: 0.6 },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: `${colors.yellow}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconDone: { backgroundColor: colors.yellow },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardTitleDone: { color: colors.subtext },
  cardSub: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  formContent: { padding: 16, gap: 16 },
  questionCard: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12,
  },
  questionNum: { fontSize: 11, fontWeight: '700', color: colors.yellow, textTransform: 'uppercase', letterSpacing: 0.5 },
  questionText: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 22 },
  textInput: {
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, fontSize: 14, color: colors.text,
    minHeight: 44, textAlignVertical: 'top',
  },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scaleBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  scaleBtnText: { fontSize: 14, fontWeight: '700', color: colors.subtext },
  scaleBtnTextActive: { color: '#0A0A0A' },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10,
    backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border,
  },
  optionRowActive: { borderColor: colors.yellow, backgroundColor: `${colors.yellow}10` },
  optionText: { fontSize: 14, color: colors.subtext, flex: 1 },
  optionTextActive: { color: colors.text, fontWeight: '600' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.yellow },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.yellow },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.dark,
  },
  submitBtn: {
    backgroundColor: colors.yellow, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
})
