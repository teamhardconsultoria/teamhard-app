import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'

export default function CoachStudentsMobile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alunos</Text>
      <Text style={styles.sub}>Acesse o painel web para gerenciar alunos.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.subtext, textAlign: 'center' },
})
