import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, ActivityIndicator, Alert, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Student {
  studentId: string
  studentUserId: string
  name: string
  lastMessage?: string
  lastType?: string
  lastAt?: string
  unread: number
}

interface Message {
  id: string
  sender_id: string
  content: string
  type?: string
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

  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [recDuration, setRecDuration] = useState(0)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { loadStudents() }, [])

  const loadStudents = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoading(false); return }
    const { data } = await supabase
      .from('students').select('id, user:users(id, name)').eq('coach_id', coach.id).order('created_at', { ascending: false })

    const list: Student[] = await Promise.all(
      (data || []).map(async (s: any) => {
        const studentUserId = s.user.id
        const { data: last } = await supabase.from('messages')
          .select('content, type, created_at')
          .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${studentUserId}),and(sender_id.eq.${studentUserId},receiver_id.eq.${user!.id})`)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        const { count } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', studentUserId).eq('receiver_id', user!.id).is('read_at', null)
        return { studentId: s.id, studentUserId, name: s.user.name, lastMessage: last?.content, lastType: last?.type, lastAt: last?.created_at, unread: count || 0 }
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
    const { data } = await supabase.from('messages')
      .select('id, sender_id, content, type, file_url, read_at, created_at')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${s.studentUserId}),and(sender_id.eq.${s.studentUserId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMsgs(false)
    markRead(s)
    subscribeToMessages(s)
  }

  const subscribeToMessages = (s: Student) => {
    supabase.channel(`coach-chat-${s.studentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message
        const isMyConv =
          (msg.sender_id === user!.id && (payload.new as any).receiver_id === s.studentUserId) ||
          (msg.sender_id === s.studentUserId && (payload.new as any).receiver_id === user!.id)
        if (isMyConv) setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()
  }

  const markRead = async (s: Student) => {
    await supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('sender_id', s.studentUserId).eq('receiver_id', user!.id).is('read_at', null)
    setStudents(prev => prev.map(st => st.studentId === s.studentId ? { ...st, unread: 0 } : st))
  }

  const sendMessage = async () => {
    if (!text.trim() || !selected) return
    const content = text.trim()
    setText('')
    const { data: inserted, error } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content, type: 'text' })
      .select('id, sender_id, content, type, file_url, read_at, created_at').single()
    if (error) { Alert.alert('Erro', error.message); return }
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', {
      body: { user_id: selected.studentUserId, title: user!.name || 'Coach', body: content.length > 80 ? content.slice(0, 80) + '…' : content, data: { screen: '/(student)/chat' }, channel_id: 'messages' },
    })
  }

  const sendPhoto = async () => {
    if (!selected) return
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true })
    if (result.canceled) return
    const asset = result.assets[0]
    const mimeType = asset.mimeType || 'image/jpeg'
    const ext = mimeType.split('/')[1] || 'jpg'
    const filename = `chat/${user!.id}/${Date.now()}.${ext}`
    try {
      const cacheUri = `${FileSystem.cacheDirectory}chat_upload_${Date.now()}.${ext}`
      await FileSystem.copyAsync({ from: asset.uri, to: cacheUri })
      const base64 = await FileSystem.readAsStringAsync(cacheUri, { encoding: FileSystem.EncodingType.Base64 })
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, bytes, { contentType: mimeType })
      if (uploadError) { Alert.alert('Erro no upload', uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted, error } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content: '', type: 'photo', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, read_at, created_at').single()
      if (error) { Alert.alert('Erro ao enviar', error.message); return }
      if (inserted) setMessages(prev => [...prev, inserted])
    } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão negada', 'Permita o acesso ao microfone nas configurações.'); return }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
    const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    setRecording(rec)
    setRecDuration(0)
    recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
  }

  const cancelRecording = async () => {
    if (!recording) return
    clearInterval(recTimerRef.current!)
    await recording.stopAndUnloadAsync()
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    setRecording(null)
    setRecDuration(0)
  }

  const stopAndSendAudio = async () => {
    if (!recording || !selected) return
    clearInterval(recTimerRef.current!)
    await recording.stopAndUnloadAsync()
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    const uri = recording.getURI()
    setRecording(null)
    setRecDuration(0)
    if (!uri) return
    const filename = `chat/${user!.id}/${Date.now()}.m4a`
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, bytes, { contentType: 'audio/m4a' })
      if (uploadError) { Alert.alert('Erro no upload', uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted, error } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content: '', type: 'audio', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, read_at, created_at').single()
      if (error) { Alert.alert('Erro ao enviar', error.message); return }
      if (inserted) setMessages(prev => [...prev, inserted])
      supabase.functions.invoke('send-push-notification', {
        body: { user_id: selected.studentUserId, title: user!.name || 'Coach', body: '🎵 Áudio', data: { screen: '/(student)/chat' }, channel_id: 'messages' },
      })
    } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const lastPreview = (msg?: string, type?: string) => {
    if (type === 'audio') return '🎵 Áudio'
    if (type === 'photo') return '📷 Foto'
    return msg || 'Nenhuma mensagem'
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user!.id
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {item.type === 'audio' && item.file_url
            ? <AudioBubble uri={item.file_url} isMe={isMe} />
            : item.file_url
              ? <Image source={{ uri: item.file_url }} style={styles.msgImage} resizeMode="cover" />
              : <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.content}</Text>
          }
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
      <KeyboardAvoidingView style={styles.container} behavior="padding">
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
          : <FlatList ref={flatListRef} data={messages} keyExtractor={i => i.id} renderItem={renderMessage}
              contentContainerStyle={styles.list} onContentSizeChange={() => flatListRef.current?.scrollToEnd()} showsVerticalScrollIndicator={false} />
        }

        <View style={styles.inputWrap}>
          {recording ? (
            <>
              <TouchableOpacity style={styles.attachBtn} onPress={cancelRecording}>
                <Ionicons name="close-circle" size={24} color="#FF4444" />
              </TouchableOpacity>
              <View style={styles.recIndicator}>
                <View style={styles.recDot} />
                <Text style={styles.recTime}>{fmtDur(recDuration)}</Text>
                <Text style={styles.recLabel}>Gravando...</Text>
              </View>
              <TouchableOpacity style={[styles.sendBtn, { backgroundColor: '#FF4444' }]} onPress={stopAndSendAudio}>
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.attachBtn} onPress={sendPhoto}>
                <Ionicons name="image" size={22} color={colors.subtext} />
              </TouchableOpacity>
              <TextInput
                style={styles.input} value={text} onChangeText={setText}
                placeholder="Mensagem..." placeholderTextColor={colors.subtext} multiline maxLength={2000}
              />
              {text.trim() ? (
                <TouchableOpacity style={[styles.sendBtn, !text.trim() && styles.sendBtnOff]} onPress={sendMessage} disabled={!text.trim()}>
                  <Ionicons name="send" size={18} color={text.trim() ? '#0A0A0A' : colors.subtext} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
                  <Ionicons name="mic" size={20} color="#0A0A0A" />
                </TouchableOpacity>
              )}
            </>
          )}
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
                      {item.lastAt && <Text style={styles.lastTime}>{new Date(item.lastAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>}
                    </View>
                    <View style={styles.studentBottom}>
                      <Text style={styles.lastMsg} numberOfLines={1}>{lastPreview(item.lastMessage, item.lastType)}</Text>
                      {item.unread > 0 && (
                        <View style={styles.badge}><Text style={styles.badgeText}>{item.unread > 9 ? '9+' : item.unread}</Text></View>
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

function AudioBubble({ uri, isMe }: { uri: string; isMe: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

  useEffect(() => {
    let s: Audio.Sound
    Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false },
      (status) => {
        if (!status.isLoaded) return
        setDuration(status.durationMillis ?? 0)
        setPosition(status.positionMillis ?? 0)
        setIsPlaying(status.isPlaying)
        if (status.didJustFinish) { setIsPlaying(false); setPosition(0) }
      }
    ).then(({ sound: loaded }) => { s = loaded; setSound(loaded) })
    return () => { s?.unloadAsync() }
  }, [uri])

  const toggle = async () => {
    if (!sound) return
    if (isPlaying) {
      await sound.pauseAsync()
    } else {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })
      if (position >= duration && duration > 0) await sound.setPositionAsync(0)
      await sound.playAsync()
    }
  }

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const progress = duration > 0 ? position / duration : 0
  const accent = isMe ? '#0A0A0A' : colors.yellow
  const muted  = isMe ? 'rgba(0,0,0,0.35)' : colors.subtext

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 160, maxWidth: 220 }}>
      <TouchableOpacity onPress={toggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name={isPlaying ? 'pause-circle' : 'play-circle'} size={38} color={accent} />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ height: 3, backgroundColor: muted, borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ width: `${progress * 100}%`, height: 3, backgroundColor: accent, borderRadius: 2 }} />
        </View>
        <Text style={{ fontSize: 11, color: muted }}>
          {isPlaying || position > 0 ? fmtMs(position) : fmtMs(duration)}
        </Text>
      </View>
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
  msgText: { fontSize: 15, color: colors.text },
  msgTextMe: { color: '#0A0A0A' },
  msgImage: { width: 200, height: 200, borderRadius: 12 },
  msgTime: { fontSize: 10, color: colors.subtext },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  attachBtn: { padding: 8 },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.text, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: colors.border },
  recIndicator: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FF444440',
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4444' },
  recTime: { fontSize: 15, fontWeight: '700', color: '#FF4444' },
  recLabel: { fontSize: 13, color: colors.subtext },
})
