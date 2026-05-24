import { View, Text, StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'

export default function CoachChatMobile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chat</Text>
      <Text style={styles.sub}>Chat com alunos — em desenvolvimento.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.subtext },
})
