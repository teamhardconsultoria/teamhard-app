import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

const FATIGUE_ICONS = ['😴', '🙂', '😅', '😤', '🥵']
const FATIGUE_LABELS = ['Fácil', 'Tranquilo', 'Moderado', 'Puxado', 'Esgotante']

export default function WorkoutFeedbackScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const [fatigue, setFatigue] = useState(2)
  const [hasPain, setHasPain] = useState(false)
  const [painDesc, setPainDesc] = useState('')
  const [notes, setNotes] = useState('')
  const [hasDifficulty, setHasDifficulty] = useState(false)
  const [difficultyNotes, setDifficultyNotes] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()

      await supabase.from('training_feedbacks').insert({
        session_id: sessionId,
        student_id: student!.id,
        fatigue_level: fatigue,
        has_pain: hasPain,
        pain_description: hasPain ? painDesc : null,
        notes: notes || null,
        difficult_exercise_notes: hasDifficulty ? difficultyNotes : null,
      })

      router.replace({
        pathname: '/(student)/workout/summary',
        params: { sessionId },
      })
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Como foi o treino?</Text>
        <Text style={styles.subtitle}>Seu feedback ajuda o coach a ajustar seu treino.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Nível de cansaço */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nível de cansaço</Text>
          <View style={styles.fatigueRow}>
            {FATIGUE_ICONS.map((icon, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.fatigueBtn, fatigue === i + 1 && styles.fatigueBtnActive]}
                onPress={() => setFatigue(i + 1)}
              >
                <Text style={styles.fatigueIcon}>{icon}</Text>
                <Text style={[styles.fatigueLabel, fatigue === i + 1 && styles.fatigueLabelActive]}>
                  {FATIGUE_LABELS[i]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sentiu alguma dor ou desconforto?</Text>
          <View style={styles.yesNo}>
            <TouchableOpacity
              style={[styles.yesNoBtn, !hasPain && styles.yesNoBtnActive]}
              onPress={() => setHasPain(false)}
            >
              <Text style={[styles.yesNoText, !hasPain && styles.yesNoTextActive]}>Não</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, hasPain && styles.yesNoBtnActiveRed]}
              onPress={() => setHasPain(true)}
            >
              <Text style={[styles.yesNoText, hasPain && styles.yesNoTextActive]}>Sim</Text>
            </TouchableOpacity>
          </View>
          {hasPain && (
            <TextInput
              style={styles.textArea}
              value={painDesc}
              onChangeText={setPainDesc}
              placeholder="Onde doeu? Como foi a dor?"
              placeholderTextColor={colors.subtext}
              multiline
              numberOfLines={3}
            />
          )}
        </View>

        {/* Dificuldades com exercício */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Teve dificuldade com algum exercício?</Text>
          <View style={styles.yesNo}>
            <TouchableOpacity
              style={[styles.yesNoBtn, !hasDifficulty && styles.yesNoBtnActive]}
              onPress={() => setHasDifficulty(false)}
            >
              <Text style={[styles.yesNoText, !hasDifficulty && styles.yesNoTextActive]}>Não</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.yesNoBtn, hasDifficulty && styles.yesNoBtnActiveYellow]}
              onPress={() => setHasDifficulty(true)}
            >
              <Text style={[styles.yesNoText, hasDifficulty && { color: '#0A0A0A' }]}>Sim</Text>
            </TouchableOpacity>
          </View>
          {hasDifficulty && (
            <TextInput
              style={styles.textArea}
              value={difficultyNotes}
              onChangeText={setDifficultyNotes}
              placeholder="Qual exercício? O que aconteceu?"
              placeholderTextColor={colors.subtext}
              multiline
              numberOfLines={3}
            />
          )}
        </View>

        {/* Observações gerais */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observações gerais</Text>
          <TextInput
            style={[styles.textArea, { minHeight: 80 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Algum comentário para o seu coach?"
            placeholderTextColor={colors.subtext}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0A0A0A" />
            : <Text style={styles.submitText}>ENVIAR FEEDBACK</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16, gap: 6 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 14, color: colors.subtext },
  content: { padding: 24, paddingTop: 8, gap: 24, paddingBottom: 120 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  fatigueRow: { flexDirection: 'row', gap: 8 },
  fatigueBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  fatigueBtnActive: { borderColor: colors.yellow, backgroundColor: `${colors.yellow}15` },
  fatigueIcon: { fontSize: 22 },
  fatigueLabel: { fontSize: 10, color: colors.subtext, fontWeight: '600', textAlign: 'center' },
  fatigueLabelActive: { color: colors.yellow },
  yesNo: { flexDirection: 'row', gap: 12 },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  yesNoBtnActive: { borderColor: colors.yellow, backgroundColor: `${colors.yellow}15` },
  yesNoBtnActiveRed: { borderColor: colors.error, backgroundColor: `${colors.error}15` },
  yesNoBtnActiveYellow: { borderColor: colors.yellow, backgroundColor: colors.yellow },
  yesNoText: { fontSize: 15, fontWeight: '700', color: colors.subtext },
  yesNoTextActive: { color: colors.yellow },
  textArea: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.dark,
  },
  submitBtn: {
    backgroundColor: colors.yellow,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
})
