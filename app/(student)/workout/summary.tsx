import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image, Dimensions, ScrollView,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import ViewShot, { captureRef } from 'react-native-view-shot'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import * as MediaLibrary from 'expo-media-library'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

const { width } = Dimensions.get('window')
const CARD_W = width - 48
const CARD_H = Math.round(CARD_W * 16 / 9)

interface SessionStats {
  workoutName: string
  dayName: string
  durationSeconds: number
  exerciseCount: number
  setCount: number
  fatigue: number
}

const FATIGUE_LABELS = ['', 'Fácil', 'Tranquilo', 'Moderado', 'Puxado', 'Esgotante']
const FATIGUE_ICONS  = ['', '😴', '🙂', '😅', '😤', '🥵']

function formatDuration(seconds: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s > 0 ? s + 's' : ''}`
  return `${s}s`
}

export default function WorkoutSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const [stats, setStats]       = useState<SessionStats | null>(null)
  const [loading, setLoading]   = useState(true)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const cardRef = useRef<ViewShot>(null)

  useEffect(() => { load() }, [sessionId])

  const load = async () => {
    if (!sessionId) { setLoading(false); return }

    const [sessionRes, setsRes, feedbackRes] = await Promise.all([
      supabase
        .from('training_sessions')
        .select('duration_seconds, workout_day:workout_days(name, workout:workouts(name))')
        .eq('id', sessionId)
        .single(),
      supabase.from('session_sets').select('exercise_id').eq('session_id', sessionId),
      supabase.from('training_feedbacks').select('fatigue_level').eq('session_id', sessionId).maybeSingle(),
    ])

    const session = sessionRes.data as any
    const sets    = setsRes.data || []

    setStats({
      workoutName:    session?.workout_day?.workout?.name || 'Treino',
      dayName:        session?.workout_day?.name || '',
      durationSeconds: session?.duration_seconds || 0,
      exerciseCount:  new Set(sets.map((s: any) => s.exercise_id)).size,
      setCount:       sets.length,
      fatigue:        feedbackRes.data?.fatigue_level || 0,
    })
    setLoading(false)
  }

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Câmera bloqueada', 'Permita o acesso à câmera nas configurações do celular.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [9, 16],
    })
    if (!result.canceled) setPhotoUri(result.assets[0].uri)
  }

  const captureAndShare = async (action: 'share' | 'save') => {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 0.95 })

      if (action === 'save') {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Galeria bloqueada', 'Permita o acesso à galeria nas configurações do celular.')
          return
        }
        await MediaLibrary.saveToLibraryAsync(uri)
        Alert.alert('Salvo!', 'Imagem salva na galeria.')
      } else {
        const available = await Sharing.isAvailableAsync()
        if (!available) { Alert.alert('Compartilhamento não disponível neste dispositivo.'); return }
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Compartilhar treino' })
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar a imagem. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={colors.yellow} size="large" /></View>
  )

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.dark }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Card capturável pelo ViewShot */}
      <ViewShot ref={cardRef} style={styles.cardWrap} options={{ format: 'png', quality: 0.95 }}>
        <View style={styles.card}>
          {/* Foto de fundo */}
          {photoUri && (
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}
          {/* Overlay escuro sobre a foto */}
          <View style={[styles.overlay, !photoUri && styles.overlayDark]} />

          {/* Troféu */}
          <View style={styles.trophyCircle}>
            <Ionicons name="trophy" size={36} color={colors.yellow} />
          </View>

          <Text style={styles.cardTitle}>Treino Concluído!</Text>
          <Text style={styles.cardSub}>
            {stats?.workoutName}{stats?.dayName ? ` · ${stats.dayName}` : ''}
          </Text>

          {/* Stats */}
          {stats && (
            <View style={styles.statsRow}>
              <StatCol icon="time-outline"             value={formatDuration(stats.durationSeconds)} label="Duração" />
              <View style={styles.statDivider} />
              <StatCol icon="barbell-outline"          value={String(stats.exerciseCount)}           label="Exercícios" />
              <View style={styles.statDivider} />
              <StatCol icon="checkmark-circle-outline" value={String(stats.setCount)}               label="Séries" />
            </View>
          )}

          {/* Intensidade */}
          {stats?.fatigue != null && stats.fatigue > 0 && (
            <View style={styles.fatigueRow}>
              <Text style={styles.fatigueEmoji}>{FATIGUE_ICONS[stats.fatigue]}</Text>
              <Text style={styles.fatigueLabel}>{FATIGUE_LABELS[stats.fatigue]}</Text>
            </View>
          )}

          {/* Marca d'água */}
          <View style={styles.watermark}>
            <Image source={require('../../../assets/logo.jpeg')} style={styles.logoImg} resizeMode="contain" />
            <Text style={styles.watermarkText}>TEAM HARD</Text>
          </View>
        </View>
      </ViewShot>

      {/* Botões fora do ViewShot */}
      <View style={styles.actions}>
        {!photoUri ? (
          <>
            <TouchableOpacity style={styles.btnPrimary} onPress={openCamera}>
              <Ionicons name="camera" size={20} color="#0A0A0A" />
              <Text style={styles.btnPrimaryText}>TIRAR SELFIE PARA STORIES</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSecondary} onPress={() => captureAndShare('share')} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={colors.text} />
                : <><Ionicons name="share-social-outline" size={18} color={colors.text} /><Text style={styles.btnSecondaryText}>Compartilhar sem foto</Text></>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => captureAndShare('share')} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#0A0A0A" />
                : <><Ionicons name="share-social" size={20} color="#0A0A0A" /><Text style={styles.btnPrimaryText}>COMPARTILHAR NOS STORIES</Text></>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSecondary} onPress={() => captureAndShare('save')} disabled={saving}>
              <Ionicons name="save-outline" size={18} color={colors.text} />
              <Text style={styles.btnSecondaryText}>Salvar na Galeria</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPhotoUri(null)}>
              <Text style={styles.btnLink}>Tirar outra foto</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.btnHome} onPress={() => router.replace('/(student)/home')}>
          <Text style={styles.btnHomeText}>Voltar para Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function StatCol({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.statCol}>
      <Ionicons name={icon as any} size={20} color={colors.yellow} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24, paddingBottom: 40, gap: 24 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },

  cardWrap: { width: CARD_W, height: CARD_H },
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 24, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 24,
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayDark: { backgroundColor: '#111111' },

  trophyCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${colors.yellow}18`,
    borderWidth: 2, borderColor: `${colors.yellow}35`,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 24, fontWeight: '900', color: colors.text, textAlign: 'center' },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14, paddingHorizontal: 8,
    marginTop: 4, width: '100%',
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)' },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  fatigueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fatigueEmoji: { fontSize: 18 },
  fatigueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  watermark: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoImg: { width: 20, height: 20, opacity: 0.5 },
  watermarkText: { fontSize: 10, fontWeight: '900', color: `${colors.yellow}60`, letterSpacing: 3 },

  actions: { width: '100%', gap: 10 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.yellow, borderRadius: 14, paddingVertical: 16,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', letterSpacing: 1 },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: colors.text },
  btnLink: { textAlign: 'center', fontSize: 13, color: colors.subtext, paddingVertical: 4 },
  btnHome: {
    alignItems: 'center', paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
  },
  btnHomeText: { fontSize: 14, fontWeight: '600', color: colors.subtext },
})
