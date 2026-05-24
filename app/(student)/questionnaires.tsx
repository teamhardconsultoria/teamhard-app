import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'

export default function QuestionnairesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Questionários</Text>
      <Text style={styles.sub}>Questionários pendentes — Fase 2.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.subtext },
})
