import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

export default function WorkoutSummaryScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="trophy" size={56} color={colors.yellow} />
      </View>
      <Text style={styles.title}>Treino concluído!</Text>
      <Text style={styles.sub}>Parabéns pelo treino de hoje. Continue assim!</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/(student)/home')}>
        <Text style={styles.btnText}>VOLTAR PARA HOME</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  iconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: `${colors.yellow}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '900', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 15, color: colors.subtext, textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: 24, backgroundColor: colors.yellow, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32 },
  btnText: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', letterSpacing: 2 },
})
