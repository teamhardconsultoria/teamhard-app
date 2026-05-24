import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'
import type { AssessmentAngle } from '@/types'

const ANGLES: { key: AssessmentAngle; label: string; icon: string }[] = [
  { key: 'front', label: 'Frente', icon: 'person' },
  { key: 'left', label: 'Lado esq.', icon: 'person-outline' },
  { key: 'right', label: 'Lado dir.', icon: 'person-outline' },
  { key: 'back', label: 'Costas', icon: 'person-outline' },
]

export default function AssessmentScreen() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<Record<AssessmentAngle, string | null>>({
    front: null, left: null, right: null, back: null,
  })

  const pickPhoto = async (angle: AssessmentAngle) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (!result.canceled) {
      setPhotos(prev => ({ ...prev, [angle]: result.assets[0].uri }))
    }
  }

  const handleSubmit = async () => {
    if (!weight) { Alert.alert('Atenção', 'Informe seu peso atual.'); return }
    setLoading(true)
    try {
      const { data: student } = await supabase
        .from('students')
        .select('id, coach_id')
        .eq('user_id', user!.id)
        .single()

      const { data: assessment, error } = await supabase
        .from('assessments')
        .insert({
          student_id: student!.id,
          coach_id: student!.coach_id,
          weight: parseFloat(weight),
          height: height ? parseFloat(height) : null,
          body_fat_pct: bodyFat ? parseFloat(bodyFat) : null,
          notes: notes || null,
        })
        .select()
        .single()

      if (error) throw error

      // Upload das fotos para o bucket privado
      for (const angle of ANGLES) {
        const uri = photos[angle.key]
        if (!uri) continue

        const filename = `assessments/${student!.id}/${assessment.id}/${angle.key}.jpg`
        const response = await fetch(uri)
        const blob = await response.blob()

        const { error: uploadError } = await supabase.storage
          .from('assessment-photos')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: true })

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('assessment-photos')
            .getPublicUrl(filename)
          await supabase.from('assessment_photos').insert({
            assessment_id: assessment.id,
            angle: angle.key,
            photo_url: publicUrl,
          })
        }
      }

      Alert.alert('Avaliação enviada!', 'Seu coach foi notificado.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: any) {
      Alert.alert('Erro', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nova Avaliação</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Medidas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Medidas</Text>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Peso (kg) *</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                placeholder="Ex: 72.5"
                placeholderTextColor={colors.subtext}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Altura (cm)</Text>
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                placeholder="Ex: 175"
                placeholderTextColor={colors.subtext}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>% Gordura (opcional)</Text>
            <TextInput
              style={styles.input}
              value={bodyFat}
              onChangeText={setBodyFat}
              placeholder="Ex: 20.5"
              placeholderTextColor={colors.subtext}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Fotos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fotos</Text>
          <Text style={styles.sectionSub}>As fotos são privadas — apenas você e seu coach podem ver.</Text>
          <View style={styles.photoGrid}>
            {ANGLES.map(angle => (
              <TouchableOpacity
                key={angle.key}
                style={styles.photoSlot}
                onPress={() => pickPhoto(angle.key)}
              >
                {photos[angle.key] ? (
                  <>
                    <Image source={{ uri: photos[angle.key]! }} style={styles.photoThumb} />
                    <View style={styles.photoOverlay}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.yellow} />
                    </View>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera" size={24} color={colors.subtext} />
                    <Text style={styles.photoLabel}>{angle.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Observações */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Como está se sentindo? Medidas corporais, percepções..."
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={4}
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
            : <Text style={styles.submitText}>ENVIAR AVALIAÇÃO</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  back: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  content: { padding: 24, gap: 28, paddingBottom: 120 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  sectionSub: { fontSize: 13, color: colors.subtext },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1, gap: 6 },
  label: { fontSize: 12, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoSlot: {
    width: '47%',
    aspectRatio: 3 / 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  photoThumb: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: colors.dark,
    borderRadius: 12,
  },
  photoLabel: { fontSize: 13, color: colors.subtext, fontWeight: '600' },
  textArea: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
    minHeight: 100,
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
