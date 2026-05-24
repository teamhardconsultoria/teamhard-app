import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Message {
  id: string
  sender_role: 'coach' | 'student'
  content: string
  media_url?: string
  created_at: string
  read_at?: string
}

interface CoachInfo {
  name: string
  email: string
}

export default function ChatScreen() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [coach, setCoach] = useState<CoachInfo | null>(null)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    const init = async () => {
      const { data: student, error: studentErr } = await supabase
        .from('students')
        .select('id, coach_id')
        .eq('user_id', user!.id)
        .single()

      if (studentErr || !student) {
        Alert.alert('Erro (init)', studentErr?.message || 'Aluno não encontrado')
        setLoading(false)
        return
      }

      setStudentId(student.id)
      setCoachId(student.coach_id)

      // Busca o usuário do coach separadamente
      const { data: coachRecord } = await supabase
        .from('coaches')
        .select('user_id')
        .eq('id', student.coach_id)
        .single()

      if (coachRecord?.user_id) {
        const { data: coachUser } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', coachRecord.user_id)
          .single()
        setCoach(coachUser)
      }

      await fetchMessages(student.id, student.coach_id)
      subscribeToMessages(student.id, student.coach_id)
      setLoading(false)
    }
    init()
  }, [])

  const fetchMessages = async (sId: string, cId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_role, content, media_url, created_at, read_at')
      .eq('student_id', sId)
      .eq('coach_id', cId)
      .order('created_at', { ascending: true })

    setMessages(data || [])

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('student_id', sId)
      .eq('coach_id', cId)
      .eq('sender_role', 'coach')
      .is('read_at', null)
  }

  const subscribeToMessages = (sId: string, cId: string) => {
    supabase
      .channel(`chat-student-${sId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `student_id=eq.${sId}`,
      }, async (payload) => {
        const msg = payload.new as Message
        setMessages(prev => [...prev, msg])
        if (msg.sender_role === 'coach') {
          await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', msg.id)
        }
      })
      .subscribe()
  }

  const sendText = async () => {
    if (!text.trim()) return
    if (!studentId || !coachId) {
      Alert.alert('Erro', `Dados não carregados.\nstudentId: ${studentId}\ncoachId: ${coachId}`)
      return
    }
    const content = text.trim()
    setText('')
    const { error } = await supabase.from('messages').insert({
      coach_id: coachId,
      student_id: studentId,
      sender_role: 'student',
      content,
    })
    if (error) { Alert.alert('Erro ao enviar', error.message); return }
    supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: coach ? (coach as any).user_id : null,
        title: user!.name || 'Aluno',
        body: content.length > 80 ? content.slice(0, 80) + '…' : content,
        data: { screen: '/(coach)/chat' },
      },
    })
  }

  const sendPhoto = async () => {
    if (!studentId || !coachId) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (result.canceled) return

    const uri = result.assets[0].uri
    const filename = `chat/${studentId}/${Date.now()}.jpg`

    const formData = new FormData()
    formData.append('file', { uri, name: filename, type: 'image/jpeg' } as any)

    const { data: upload } = await supabase.storage
      .from('chat-media')
      .upload(filename, formData)

    if (upload) {
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      await supabase.from('messages').insert({
        coach_id: coachId,
        student_id: studentId,
        sender_role: 'student',
        media_url: publicUrl,
      })
    }
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_role === 'student'
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgWrapRight : styles.msgWrapLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {item.media_url ? (
            <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
          ) : (
            <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
          )}
        </View>
        <Text style={styles.msgTime}>
          {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {isMe && (item.read_at ? ' ✓✓' : ' ✓')}
        </Text>
      </View>
    )
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <View style={styles.coachAvatar}>
          <Text style={styles.coachAvatarText}>{coach?.name?.charAt(0) || 'C'}</Text>
        </View>
        <View>
          <Text style={styles.coachName}>{coach?.name || 'Seu Coach'}</Text>
          <Text style={styles.coachSub}>Coach</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.inputWrap}>
        <TouchableOpacity style={styles.attachBtn} onPress={sendPhoto}>
          <Ionicons name="image" size={22} color={colors.subtext} />
        </TouchableOpacity>
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
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={sendText}
          disabled={!text.trim()}
        >
          <Ionicons name="send" size={18} color={text.trim() ? '#0A0A0A' : colors.subtext} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  coachAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.yellow,
    alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  coachName: { fontSize: 16, fontWeight: '700', color: colors.text },
  coachSub: { fontSize: 12, color: colors.subtext },
  list: { padding: 16, gap: 8, paddingBottom: 16 },
  msgWrap: { maxWidth: '78%', gap: 3 },
  msgWrapRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgWrapLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: colors.yellow, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 15, color: colors.dark },
  msgTextMe: { color: '#0A0A0A' },
  msgImage: { width: 200, height: 200, borderRadius: 12 },
  msgTime: { fontSize: 10, color: colors.subtext },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.dark,
  },
  attachBtn: { padding: 8 },
  input: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: colors.text, maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
})
