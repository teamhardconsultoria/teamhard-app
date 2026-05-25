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
  sender_id: string
  content: string
  file_url?: string
  read_at?: string
  created_at: string
}

export default function ChatScreen() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [coachUserId, setCoachUserId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState('Seu Coach')
  const [loading, setLoading] = useState(true)
  const flatListRef = useRef<FlatList>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: student, error } = await supabase
        .from('students')
        .select('id, coach_id')
        .eq('user_id', user!.id)
        .single()

      if (error || !student) {
        Alert.alert('Erro', error?.message || 'Aluno não encontrado')
        setLoading(false)
        return
      }

      const { data: coach } = await supabase
        .from('coaches')
        .select('user_id')
        .eq('id', student.coach_id)
        .single()

      if (!coach) { setLoading(false); return }

      const { data: coachUser } = await supabase
        .from('users')
        .select('name')
        .eq('id', coach.user_id)
        .single()

      setCoachUserId(coach.user_id)
      setCoachName(coachUser?.name || 'Coach')

      await fetchMessages(user!.id, coach.user_id)
      subscribeToMessages(user!.id, coach.user_id)
      setLoading(false)
    }
    init()
  }, [])

  const fetchMessages = async (myId: string, coachId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, file_url, read_at, created_at')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${coachId}),and(sender_id.eq.${coachId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true })

    setMessages(data || [])

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('receiver_id', myId)
      .eq('sender_id', coachId)
      .is('read_at', null)
  }

  const subscribeToMessages = (myId: string, coachId: string) => {
    supabase
      .channel(`chat-${myId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload) => {
        const msg = payload.new as any
        const isMyConv =
          (msg.sender_id === myId && msg.receiver_id === coachId) ||
          (msg.sender_id === coachId && msg.receiver_id === myId)
        if (!isMyConv) return
        setMessages(prev => [...prev, msg])
        if (msg.sender_id === coachId) {
          await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id)
        }
      })
      .subscribe()
  }

  const sendText = async () => {
    if (!text.trim() || !coachUserId) return
    const content = text.trim()
    setText('')
    const { data: inserted, error } = await supabase.from('messages').insert({
      sender_id: user!.id,
      receiver_id: coachUserId,
      content,
      type: 'text',
    }).select('id, sender_id, content, file_url, read_at, created_at').single()
    if (error) { Alert.alert('Erro ao enviar', error.message); return }
    if (inserted) setMessages(prev => [...prev, inserted])
    else {
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: coachUserId,
          title: user!.name || 'Aluno',
          body: content.length > 80 ? content.slice(0, 80) + '…' : content,
          data: { screen: '/(coach)/chat' },
        },
      })
    }
  }

  const sendPhoto = async () => {
    if (!coachUserId) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (result.canceled) return

    const uri = result.assets[0].uri
    const filename = `chat/${user!.id}/${Date.now()}.jpg`
    const formData = new FormData()
    formData.append('file', { uri, name: filename, type: 'image/jpeg' } as any)

    const { data: upload } = await supabase.storage.from('chat-media').upload(filename, formData)
    if (upload) {
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      await supabase.from('messages').insert({
        sender_id: user!.id,
        receiver_id: coachUserId,
        type: 'photo',
        file_url: publicUrl,
      })
    }
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user!.id
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgWrapRight : styles.msgWrapLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {item.file_url ? (
            <Image source={{ uri: item.file_url }} style={styles.msgImage} resizeMode="cover" />
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.coachAvatar}>
          <Text style={styles.coachAvatarText}>{coachName.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.coachName}>{coachName}</Text>
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  coachAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
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
    padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.dark,
  },
  attachBtn: { padding: 8 },
  input: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: colors.text, maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.border },
})
