import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'

export default function CoachDashboardMobile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.sub}>Use o painel web para uma experiência completa de coach.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.subtext, textAlign: 'center' },
})
