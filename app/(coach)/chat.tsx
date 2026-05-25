import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Student {
  studentId: string
  studentUserId: string
  name: string
  lastMessage?: string
  lastAt?: string
  unread: number
}

interface Message {
  id: string
  sender_id: string
  content: string
  file_url?: string
  read_at?: string
  created_at: string
}

export default function CoachChatMobile() {
  const { user } = useAuthStore()
  const [students, setStudents] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => { loadStudents() }, [])

  const loadStudents = async () => {
    const { data: coach } = await supabase
      .from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }

    const { data } = await supabase
      .from('students')
      .select('id, user:users(id, name)')
      .eq('coach_id', coach.id)
      .order('created_at', { ascending: false })

    const list: Student[] = await Promise.all(
      (data || []).map(async (s: any) => {
        const studentUserId = s.user.id
        const { data: last } = await supabase
          .from('messages')
          .select('content, created_at, sender_id')
          .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${studentUserId}),and(sender_id.eq.${studentUserId},receiver_id.eq.${user!.id})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', studentUserId)
          .eq('receiver_id', user!.id)
          .is('read_at', null)

        return {
          studentId: s.id,
          studentUserId,
          name: s.user.name,
          lastMessage: last?.content,
          lastAt: last?.created_at,
          unread: count || 0,
        }
      })
    )

    list.sort((a, b) => {
      if (!a.lastAt && !b.lastAt) return 0
      if (!a.lastAt) return 1
      if (!b.lastAt) return -1
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    })

    setStudents(list)
    setLoading(false)
  }

  const selectStudent = async (s: Student) => {
    setSelected(s)
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, file_url, read_at, created_at')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${s.studentUserId}),and(sender_id.eq.${s.studentUserId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMsgs(false)
    markRead(s)
    subscribeToMessages(s)
  }

  const subscribeToMessages = (s: Student) => {
    supabase
      .channel(`coach-chat-${s.studentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message
        const isMyConv =
          (msg.sender_id === user!.id && (payload.new as any).receiver_id === s.studentUserId) ||
          (msg.sender_id === s.studentUserId && (payload.new as any).receiver_id === user!.id)
        if (isMyConv) setMessages(prev => [...prev, msg])
      })
      .subscribe()
  }

  const markRead = async (s: Student) => {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', s.studentUserId)
      .eq('receiver_id', user!.id)
      .is('read_at', null)
    setStudents(prev => prev.map(st => st.studentId === s.studentId ? { ...st, unread: 0 } : st))
  }

  const sendMessage = async () => {
    if (!text.trim() || !selected) return
    const content = text.trim()
    setText('')
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content, type: 'text' })
      .select('id, sender_id, content, file_url, read_at, created_at')
      .single()
    if (error) { Alert.alert('Erro', error.message); return }
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: selected.studentUserId,
        title: user!.name || 'Coach',
        body: content.length > 80 ? content.slice(0, 80) + '…' : content,
        data: { screen: '/(student)/chat' },
      },
    })
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user!.id
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
        </View>
        <Text style={styles.msgTime}>
          {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {isMe && (item.read_at ? ' ✓✓' : ' ✓')}
        </Text>
      </View>
    )
  }

  if (selected) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelected(null); loadStudents() }} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{selected.name.charAt(0)}</Text>
          </View>
          <Text style={styles.headerName}>{selected.name}</Text>
        </View>

        {loadingMsgs
          ? <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>
          : <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={i => i.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.list}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
              showsVerticalScrollIndicator={false}
            />
        }

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Mensagem..."
            placeholderTextColor={colors.subtext}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]}
            onPress={sendMessage}
            disabled={!text.trim()}
          >
            <Ionicons name="send" size={18} color={text.trim() ? '#0A0A0A' : colors.subtext} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Chat</Text>
      </View>
      {loading
        ? <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>
        : students.length === 0
          ? <View style={styles.center}><Text style={styles.empty}>Nenhum aluno cadastrado.</Text></View>
          : <FlatList
              data={students}
              keyExtractor={s => s.studentId}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.studentRow} onPress={() => selectStudent(item)}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <View style={styles.studentTop}>
                      <Text style={styles.studentName}>{item.name}</Text>
                      {item.lastAt && (
                        <Text style={styles.lastTime}>
                          {new Date(item.lastAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </View>
                    <View style={styles.studentBottom}>
                      <Text style={styles.lastMsg} numberOfLines={1}>
                        {item.lastMessage || 'Nenhuma mensagem'}
                      </Text>
                      {item.unread > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{item.unread > 9 ? '9+' : item.unread}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
      }
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { padding: 4 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  headerName: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.subtext, fontSize: 14 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  studentInfo: { flex: 1 },
  studentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  studentName: { fontSize: 15, fontWeight: '700', color: colors.text },
  lastTime: { fontSize: 11, color: colors.subtext },
  studentBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  lastMsg: { fontSize: 13, color: colors.subtext, flex: 1 },
  badge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#0A0A0A' },
  list: { padding: 16, gap: 8, paddingBottom: 16 },
  msgWrap: { maxWidth: '78%', gap: 3 },
  msgRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: colors.yellow, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 15, color: colors.dark },
  msgTextMe: { color: '#0A0A0A' },
  msgTime: { fontSize: 10, color: colors.subtext },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.text, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: colors.border },
})
