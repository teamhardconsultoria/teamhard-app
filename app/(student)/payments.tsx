import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Image, Share,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Payment {
  id: string
  amount: number
  status: string
  payment_method: string
  due_date: string
  paid_at?: string
  plan_type: string
  created_at: string
  invoice_url?: string
  bank_slip_url?: string
  pix_qr_code?: string
  pix_payload?: string
}

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual', permuta: 'Permuta',
}

export default function PaymentsScreen() {
  const { user } = useAuthStore()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useFocusEffect(useCallback(() => {
    const load = async () => {
      setLoading(true)
      const { data: student } = await supabase.from('students').select('id').eq('user_id', user!.id).single()
      if (!student) { setLoading(false); return }
      const { data } = await supabase.from('payments').select('*').eq('student_id', student.id).order('created_at', { ascending: false })
      setPayments(data || [])
      setLoading(false)
    }
    load()
  }, []))

  const copyPix = async (_id: string, payload: string) => {
    await Share.share({ message: payload })
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.yellow} /></View>

  if (payments.length === 0) return (
    <View style={s.center}>
      <Ionicons name="card-outline" size={48} color={colors.border} />
      <Text style={s.emptyTitle}>Nenhuma cobrança</Text>
      <Text style={s.emptyText}>Suas cobranças aparecerão aqui.</Text>
    </View>
  )

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Pagamentos</Text>
      </View>
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {payments.map(p => {
          const isPending = p.status === 'pending'
          const isOpen = expanded === p.id

          return (
            <View key={p.id} style={[s.card, isPending && s.cardPending]}>
              {/* Cabeçalho do card */}
              <TouchableOpacity style={s.row} onPress={() => setExpanded(isOpen ? null : p.id)} activeOpacity={0.7}>
                <View style={[s.statusDot, { backgroundColor: isPending ? '#FF9800' : '#00C853' }]} />
                <View style={s.info}>
                  <Text style={s.amount}>R$ {p.amount.toFixed(2).replace('.', ',')}</Text>
                  <Text style={s.meta}>
                    {isPending ? 'Pendente' : 'Pago'} · {p.payment_method} · {PLAN_LABEL[p.plan_type] || p.plan_type}
                  </Text>
                  <Text style={s.date}>
                    Vencimento: {new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    {p.paid_at ? `  ·  Pago em: ${new Date(p.paid_at).toLocaleDateString('pt-BR')}` : ''}
                  </Text>
                </View>
                {isPending && (
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.subtext} />
                )}
              </TouchableOpacity>

              {/* Detalhes (só pendentes) */}
              {isOpen && isPending && (
                <View style={s.details}>
                  {p.pix_qr_code ? (
                    <>
                      <Text style={s.detailLabel}>QR Code PIX</Text>
                      <View style={s.qrWrap}>
                        <Image
                          source={{ uri: `data:image/png;base64,${p.pix_qr_code}` }}
                          style={s.qr}
                          resizeMode="contain"
                        />
                      </View>
                    </>
                  ) : null}

                  {p.pix_payload ? (
                    <TouchableOpacity style={s.copyBtn} onPress={() => copyPix(p.id, p.pix_payload!)} activeOpacity={0.8}>
                      <Ionicons name="share-outline" size={18} color="#0A0A0A" />
                      <Text style={s.copyBtnText}>Compartilhar código PIX</Text>
                    </TouchableOpacity>
                  ) : null}

                  {p.bank_slip_url ? (
                    <TouchableOpacity style={s.outlineBtn} onPress={() => Linking.openURL(p.bank_slip_url!)} activeOpacity={0.8}>
                      <Ionicons name="open-outline" size={16} color={colors.text} />
                      <Text style={s.outlineBtnText}>Abrir Boleto</Text>
                    </TouchableOpacity>
                  ) : null}

                  {p.invoice_url ? (
                    <TouchableOpacity style={s.outlineBtn} onPress={() => Linking.openURL(p.invoice_url!)} activeOpacity={0.8}>
                      <Ionicons name="receipt-outline" size={16} color={colors.text} />
                      <Text style={s.outlineBtnText}>Ver Fatura</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.dark },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, color: colors.subtext },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  list: { padding: 20, paddingTop: 0, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    overflow: 'hidden',
  },
  cardPending: { borderColor: 'rgba(255,152,0,0.3)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  info: { flex: 1 },
  amount: { fontSize: 20, fontWeight: '900', color: colors.text },
  meta: { fontSize: 12, color: colors.subtext, marginTop: 3 },
  date: { fontSize: 11, color: colors.subtext, marginTop: 2 },
  details: { marginTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  detailLabel: { fontSize: 11, color: colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  qrWrap: { alignItems: 'center' },
  qr: { width: 220, height: 220, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, backgroundColor: colors.yellow, borderRadius: 12,
  },
  copyBtnText: { fontSize: 14, fontWeight: '800', color: '#0A0A0A' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
})
