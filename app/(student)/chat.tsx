import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Image, ActivityIndicator, Alert, Modal,
  Pressable, Linking, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { colors } from '@/lib/theme'

interface Message {
  id: string
  sender_id: string
  content: string
  type?: string
  file_url?: string
  read_at?: string
  created_at: string
}

export default function ChatScreen() {
  const { user } = useAuthStore()
  const [mode, setMode] = useState<'coach' | 'support'>('coach')
  const [messages, setMessages] = useState<Message[]>([])
  const [coachUserId, setCoachUserId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState('Seu Coach')
  const [supportUserId, setSupportUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const [text, setText] = useState('')

  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [recDuration, setRecDuration] = useState(0)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const partnerId = mode === 'coach' ? coachUserId : supportUserId
  const partnerName = mode === 'coach' ? coachName : 'Suporte'

  useEffect(() => {
    const init = async () => {
      const { data: student, error } = await supabase
        .from('students').select('id, coach_id').eq('user_id', user!.id).single()
      if (error || !student) { Alert.alert('Erro', error?.message || 'Aluno não encontrado'); setLoading(false); return }
      const [coachRes, saRes] = await Promise.all([
        supabase.from('coaches').select('user_id').eq('id', student.coach_id).single(),
        supabase.from('users').select('id').eq('role', 'super_admin').maybeSingle(),
      ])
      if (coachRes.data) {
        const { data: coachUser } = await supabase.from('users').select('name').eq('id', coachRes.data.user_id).single()
        setCoachUserId(coachRes.data.user_id)
        setCoachName(coachUser?.name || 'Coach')
      }
      setSupportUserId(saRes.data?.id || null)
      setLoading(false)
    }
    init()
  }, [])

  useFocusEffect(useCallback(() => {
    if (user?.id && partnerId) fetchMessages(user.id, partnerId)
  }, [partnerId]))

  useEffect(() => {
    if (!user?.id || !partnerId) return
    setMessages([])
    fetchMessages(user.id, partnerId)
    const channel = supabase
      .channel(`chat-${user.id}-${partnerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any
        const isMyConv =
          (msg.sender_id === user!.id && msg.receiver_id === partnerId) ||
          (msg.sender_id === partnerId && msg.receiver_id === user!.id)
        if (!isMyConv) return
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        if (msg.sender_id === partnerId)
          await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [mode, coachUserId, supportUserId])

  const fetchMessages = async (myId: string, pid: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, type, file_url, read_at, created_at')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${pid}),and(sender_id.eq.${pid},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    await supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('receiver_id', myId).eq('sender_id', pid).is('read_at', null)
  }

  const sendText = async () => {
    if (!text.trim() || !partnerId) return
    setSending(true)
    const content = text.trim()
    setText('')
    const { data: inserted, error } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: partnerId, content, type: 'text' })
      .select('id, sender_id, content, type, file_url, read_at, created_at').single()
    if (error) { Alert.alert('Erro ao enviar', error.message); setSending(false); return }
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', {
      body: { user_id: partnerId, title: user!.name || 'Aluno', body: content.length > 80 ? content.slice(0, 80) + '…' : content, data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' },
    })
    setSending(false)
  }

  const uploadAndSend = async (uri: string, mimeType: string, name: string) => {
    if (!partnerId) return
    const isImage = mimeType.startsWith('image/')
    const ext = name.split('.').pop() || (isImage ? 'jpg' : 'bin')
    const filename = `chat/${user!.id}/${Date.now()}.${ext}`
    try {
      const cacheUri = `${FileSystem.cacheDirectory}chat_upload_${Date.now()}.${ext}`
      await FileSystem.copyAsync({ from: uri, to: cacheUri })
      const base64 = await FileSystem.readAsStringAsync(cacheUri, { encoding: 'base64' as any })
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, bytes, { contentType: mimeType })
      if (uploadError) { Alert.alert('Erro no upload', uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted, error } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: partnerId, content: isImage ? '' : name, type: isImage ? 'photo' : 'file', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, read_at, created_at').single()
      if (error) { Alert.alert('Erro ao enviar', error.message); return }
      if (inserted) setMessages(prev => [...prev, inserted])
      supabase.functions.invoke('send-push-notification', {
        body: { user_id: partnerId, title: user!.name || 'Aluno', body: isImage ? '📷 Foto' : `📎 ${name}`, data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' },
      })
    } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  const pickFromGallery = async () => {
    setShowAttachMenu(false)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Permita o acesso à galeria nas configurações.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const mimeType = asset.mimeType || 'image/jpeg'
    const name = asset.fileName || `foto_${Date.now()}.jpg`
    await uploadAndSend(asset.uri, mimeType, name)
  }

  const pickFromCamera = async () => {
    setShowAttachMenu(false)
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Permita o acesso à câmera nas configurações.'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const mimeType = asset.mimeType || 'image/jpeg'
    const name = asset.fileName || `foto_${Date.now()}.jpg`
    await uploadAndSend(asset.uri, mimeType, name)
  }

  const pickFile = async () => {
    setShowAttachMenu(false)
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (result.canceled) return
    const asset = result.assets[0]
    if (asset.size && asset.size > 3 * 1024 * 1024) { Alert.alert('Arquivo muito grande', 'O limite é de 3MB.'); return }
    const mimeType = asset.mimeType || 'application/octet-stream'
    await uploadAndSend(asset.uri, mimeType, asset.name || 'arquivo')
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
    if (!recording || !partnerId) return
    clearInterval(recTimerRef.current!)
    await recording.stopAndUnloadAsync()
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
    const uri = recording.getURI()
    setRecording(null)
    setRecDuration(0)
    if (!uri) return
    const filename = `chat/${user!.id}/${Date.now()}.m4a`
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any })
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, bytes, { contentType: 'audio/m4a' })
      if (uploadError) { Alert.alert('Erro no upload', uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted, error } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: partnerId, content: '', type: 'audio', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, read_at, created_at').single()
      if (error) { Alert.alert('Erro ao enviar', error.message); return }
      if (inserted) setMessages(prev => [...prev, inserted])
      supabase.functions.invoke('send-push-notification', {
        body: { user_id: partnerId, title: user!.name || 'Aluno', body: '🎵 Áudio', data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' },
      })
    } catch (e: any) { Alert.alert('Erro', e.message) }
  }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id
    return (
      <View style={[styles.msgWrap, isMe ? styles.msgWrapRight : styles.msgWrapLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {item.type === 'audio' && item.file_url
            ? <AudioBubble uri={item.file_url} isMe={isMe} />
            : item.type === 'file' && item.file_url
              ? <FileBubble uri={item.file_url} name={item.content || 'Arquivo'} isMe={isMe} />
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.yellow} /></View>

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{partnerName.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.partnerName}>{partnerName}</Text>
          <Text style={styles.partnerSub}>{mode === 'coach' ? 'Coach' : 'Suporte Método Acelera!'}</Text>
        </View>
      </View>

      {supportUserId && (
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, mode === 'coach' && styles.tabActive]} onPress={() => setMode('coach')}>
            <Text style={[styles.tabText, mode === 'coach' && styles.tabTextActive]}>Coach</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, mode === 'support' && styles.tabActive]} onPress={() => setMode('support')}>
            <Text style={[styles.tabText, mode === 'support' && styles.tabTextActive]}>Suporte</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        showsVerticalScrollIndicator={false}
      />

      {/* Input */}
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
            <TouchableOpacity style={styles.attachBtn} onPress={() => setShowAttachMenu(true)}>
              <Ionicons name="attach" size={22} color={showAttachMenu ? colors.yellow : colors.subtext} />
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
            {text.trim() ? (
              <TouchableOpacity
                style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
                onPress={sendText}
                disabled={!text.trim() || sending}
              >
                <Ionicons name="send" size={18} color={text.trim() && !sending ? '#0A0A0A' : colors.subtext} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
                <Ionicons name="mic" size={20} color="#0A0A0A" />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Bottom sheet de anexo */}
      <Modal visible={showAttachMenu} transparent animationType="slide" onRequestClose={() => setShowAttachMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAttachMenu(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />

            <AttachOption
              icon="camera"
              label="Câmera"
              sub="Tirar uma foto agora"
              onPress={pickFromCamera}
            />
            <AttachOption
              icon="images"
              label="Galeria"
              sub="Escolher foto ou vídeo"
              onPress={pickFromGallery}
            />
            <AttachOption
              icon="document-attach"
              label="Arquivo"
              sub="PDF, doc, zip e outros…"
              onPress={pickFile}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function AttachOption({ icon, label, sub, onPress }: { icon: any; label: string; sub: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.attachOption} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.attachIconWrap}>
        <Ionicons name={icon} size={22} color={colors.yellow} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.attachLabel}>{label}</Text>
        <Text style={styles.attachSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.subtext} />
    </TouchableOpacity>
  )
}

function FileBubble({ uri, name, isMe }: { uri: string; name: string; isMe: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(uri)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 120, maxWidth: 200 }}
      activeOpacity={0.7}
    >
      <Ionicons name="document-attach" size={22} color={isMe ? '#0A0A0A' : colors.yellow} />
      <Text style={{ fontSize: 13, color: isMe ? '#0A0A0A' : colors.text, flex: 1 }} numberOfLines={2}>{name}</Text>
    </TouchableOpacity>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dark },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#0A0A0A' },
  partnerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  partnerSub: { fontSize: 12, color: colors.subtext },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.yellow },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.subtext },
  tabTextActive: { color: colors.yellow },
  list: { padding: 16, gap: 8, paddingBottom: 16 },
  msgWrap: { maxWidth: '78%', gap: 3 },
  msgWrapRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgWrapLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: colors.yellow, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 15, color: colors.text },
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
  recIndicator: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FF444440',
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4444' },
  recTime: { fontSize: 15, fontWeight: '700', color: '#FF4444' },
  recLabel: { fontSize: 13, color: colors.subtext },
  // Bottom sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  attachOption: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  attachIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(232,255,0,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  attachLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  attachSub: { fontSize: 12, color: colors.subtext, marginTop: 2 },
})
