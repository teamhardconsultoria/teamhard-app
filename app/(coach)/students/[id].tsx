import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, Dimensions, RefreshControl,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors } from '@/lib/theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface AssessmentPhoto {
  angle: string
  photo_url: string
}

interface Assessment {
  id: string
  created_at: string
  weight: number | null
  height: number | null
  body_fat_pct: number | null
  notes: string | null
  photos: AssessmentPhoto[]
}

const ANGLE_LABELS: Record<string, string> = {
  front: 'Frente',
  back: 'Costas',
  left: 'Lado esq.',
  right: 'Lado dir.',
}

export default function StudentAssessmentsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>()
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const load = async () => {
    const { data: assData } = await supabase
      .from('assessments')
      .select('id, created_at, weight, height, body_fat_pct, notes')
      .eq('student_id', id)
      .order('created_at', { ascending: false })

    if (!assData) { setLoading(false); setRefreshing(false); return }

    const list: Assessment[] = await Promise.all(
      assData.map(async (a) => {
        const { data: photos } = await supabase
          .from('assessment_photos')
          .select('angle, photo_url')
          .eq('assessment_id', a.id)
        return { ...a, photos: photos || [] }
      })
    )

    setAssessments(list)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [id])

  const onRefresh = async () => { setRefreshing(true); await load() }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || '?').charAt(0)}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerSub}>
            {assessments.length} avaliação{assessments.length !== 1 ? 'ões' : ''}
          </Text>
        </View>
      </View>

      {assessments.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={40} color={colors.subtext} />
          <Text style={styles.empty}>Nenhuma avaliação ainda.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.yellow} />}
        >
          {assessments.map((a, idx) => (
            <View key={a.id} style={styles.card}>
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>#{assessments.length - idx}</Text>
                </View>
                <Text style={styles.cardDate}>
                  {new Date(a.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </Text>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                {a.weight != null && (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{a.weight} kg</Text>
                    <Text style={styles.statLabel}>Peso</Text>
                  </View>
                )}
                {a.height != null && (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{a.height} cm</Text>
                    <Text style={styles.statLabel}>Altura</Text>
                  </View>
                )}
                {a.body_fat_pct != null && (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{a.body_fat_pct}%</Text>
                    <Text style={styles.statLabel}>% Gordura</Text>
                  </View>
                )}
              </View>

              {/* Notes */}
              {!!a.notes && (
                <View style={styles.notesWrap}>
                  <Text style={styles.notesLabel}>Observações</Text>
                  <Text style={styles.notesText}>{a.notes}</Text>
                </View>
              )}

              {/* Photos */}
              {a.photos.length > 0 && (
                <View style={styles.photosSection}>
                  <Text style={styles.photosLabel}>Fotos</Text>
                  <View style={styles.photosGrid}>
                    {a.photos.map((p) => (
                      <TouchableOpacity
                        key={p.angle}
                        style={styles.photoWrap}
                        onPress={() => setLightboxUrl(p.photo_url)}
                        activeOpacity={0.85}
                      >
                        <Image
                          source={{ uri: p.photo_url }}
                          style={styles.photo}
                          resizeMode="cover"
                        />
                        <View style={styles.photoLabel}>
                          <Text style={styles.photoLabelText}>
                            {ANGLE_LABELS[p.angle] || p.angle}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Lightbox */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <View style={styles.lightboxBg}>
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl && (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  )
}

const PHOTO_SIZE = (SCREEN_WIDTH - 32 - 16 - 8) / 2

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
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  headerSub: { fontSize: 12, color: colors.subtext, marginTop: 1 },
  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indexBadge: {
    backgroundColor: `${colors.yellow}20`, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  indexText: { fontSize: 11, fontWeight: '800', color: colors.yellow },
  cardDate: { fontSize: 14, fontWeight: '700', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 24 },
  stat: { gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.subtext },
  notesWrap: {
    backgroundColor: `${colors.border}55`, borderRadius: 10, padding: 12, gap: 4,
  },
  notesLabel: { fontSize: 11, fontWeight: '700', color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  notesText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  photosSection: { gap: 10 },
  photosLabel: { fontSize: 11, fontWeight: '700', color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { width: PHOTO_SIZE, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE * 1.25 },
  photoLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 5, paddingHorizontal: 8,
  },
  photoLabelText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  lightboxBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    padding: 6,
  },
  lightboxImg: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.4 },
})
