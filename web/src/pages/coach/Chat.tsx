import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, MessageSquare, Search, Mic, MicOff, Play, Pause, ImageIcon, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Conversation {
  studentId: string; studentUserId: string; name: string; email: string
  lastMessage?: string; lastType?: string; lastAt?: string; unread: number
}
interface Message {
  id: string; sender_id: string; content: string; type?: string; file_url?: string; created_at: string; read_at?: string
}

const spin = { width:24, height:24, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

function getMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

export default function Chat() {
  const { user } = useAuthStore()
  const { studentId } = useParams<{ studentId?: string }>()
  const navigate = useNavigate()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [search, setSearch] = useState('')
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [superAdminUserId, setSuperAdminUserId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [recDuration, setRecDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { loadCoachAndConversations() }, [])

  useEffect(() => {
    if (!coachId || !conversations.length) return
    if (studentId) {
      const conv = conversations.find(c => c.studentId === studentId)
      if (conv) selectConversation(conv)
    }
  }, [studentId, coachId, conversations])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadCoachAndConversations = async () => {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
    if (!coach) { setLoadingConvs(false); return }
    setCoachId(coach.id)
    const { data: sa } = await supabase.from('users').select('id').eq('role', 'super_admin').maybeSingle()
    const saId = sa?.id || null
    setSuperAdminUserId(saId)
    await loadConversations(coach.id, saId)
    setLoadingConvs(false)
  }

  const loadConversations = async (cId: string, saId?: string | null) => {
    const { data: students } = await supabase.from('students').select('id, user:users(id, name, email)').eq('coach_id', cId).order('created_at', { ascending: false })
    if (!students) return
    const convs: Conversation[] = await Promise.all(students.map(async (s: any) => {
      const uid = s.user.id
      const { data: last } = await supabase.from('messages').select('content, type, created_at, sender_id')
        .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${uid}),and(sender_id.eq.${uid},receiver_id.eq.${user!.id})`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const { count } = await supabase.from('messages').select('id', { count:'exact', head:true })
        .eq('sender_id', uid).eq('receiver_id', user!.id).is('read_at', null)
      return { studentId: s.id, studentUserId: uid, name: s.user.name, email: s.user.email, lastMessage: last?.content, lastType: last?.type, lastAt: last?.created_at, unread: count || 0 }
    }))
    convs.sort((a, b) => {
      if (!a.lastAt && !b.lastAt) return 0
      if (!a.lastAt) return 1; if (!b.lastAt) return -1
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    })
    if (saId) {
      const { data: lastSup } = await supabase.from('messages').select('content, type, created_at')
        .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${saId}),and(sender_id.eq.${saId},receiver_id.eq.${user!.id})`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const { count: unreadSup } = await supabase.from('messages').select('id', { count:'exact', head:true })
        .eq('sender_id', saId).eq('receiver_id', user!.id).is('read_at', null)
      convs.unshift({ studentId: 'support', studentUserId: saId, name: 'Suporte', email: 'Fale com o suporte Método Acelera!', lastMessage: lastSup?.content, lastType: lastSup?.type, lastAt: lastSup?.created_at, unread: unreadSup || 0 })
    }
    setConversations(convs)
  }

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    navigate(`/coach/chat/${conv.studentId}`, { replace: true })
    setLoadingMsgs(true)
    const { data } = await supabase.from('messages').select('id, sender_id, content, type, file_url, created_at, read_at')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${conv.studentUserId}),and(sender_id.eq.${conv.studentUserId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMsgs(false)
    supabase.channel(`chat-coach-${conv.studentUserId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`receiver_id=eq.${user!.id}` }, (payload) => {
        const msg = payload.new as Message
        if (msg.sender_id === conv.studentUserId) { setMessages(prev => [...prev, msg]); markRead(conv) }
      }).subscribe()
    markRead(conv)
  }

  const markRead = async (conv: Conversation) => {
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('sender_id', conv.studentUserId).eq('receiver_id', user!.id).is('read_at', null)
    setConversations(prev => prev.map(c => c.studentId === conv.studentId ? { ...c, unread: 0 } : c))
  }

  const sendMessage = async () => {
    if (!text.trim() || !selected || !coachId) return
    setSending(true)
    const content = text.trim(); setText('')
    const { data: inserted } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content, type: 'text' })
      .select('id, sender_id, content, type, file_url, created_at, read_at').single()
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', { body: { user_id: selected.studentUserId, title: user?.name || 'Coach', body: content.length > 80 ? content.slice(0, 80) + '…' : content, data: { screen: '/(student)/chat' } } })
    setSending(false)
    loadConversations(coachId, superAdminUserId)
  }

  const sendPhoto = async (file: File) => {
    if (!selected) return
    const ext = file.name.split('.').pop() || 'jpg'
    const filename = `chat/${user!.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, file, { contentType: file.type })
    if (uploadError) { alert('Erro no upload: ' + uploadError.message); return }
    const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
    const { data: inserted } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content: '', type: 'photo', file_url: publicUrl })
      .select('id, sender_id, content, type, file_url, created_at, read_at').single()
    if (inserted) setMessages(prev => [...prev, inserted])
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getMimeType()
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setRecDuration(0)
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    clearInterval(recTimerRef.current!)
    mr.stream.getTracks().forEach(t => t.stop())
    mr.stop()
    mediaRecorderRef.current = null
    chunksRef.current = []
    setIsRecording(false)
    setRecDuration(0)
  }

  const stopAndSendAudio = () => {
    const mr = mediaRecorderRef.current
    if (!mr || !selected) return
    clearInterval(recTimerRef.current!)
    mr.onstop = async () => {
      const mimeType = mr.mimeType || 'audio/webm'
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const filename = `chat/${user!.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(filename, blob, { contentType: mimeType })
      if (uploadError) { alert('Erro no upload: ' + uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: selected.studentUserId, content: '', type: 'audio', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, created_at, read_at').single()
      if (inserted) setMessages(prev => [...prev, inserted])
      supabase.functions.invoke('send-push-notification', { body: { user_id: selected.studentUserId, title: user?.name || 'Coach', body: '🎵 Áudio', data: { screen: '/(student)/chat' } } })
    }
    mr.stream.getTracks().forEach(t => t.stop())
    mr.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
    setRecDuration(0)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
      : d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
  }

  const lastPreview = (msg?: string, type?: string) => {
    if (type === 'audio') return '🎵 Áudio'
    if (type === 'photo') return '📷 Foto'
    return msg || 'Nenhuma mensagem ainda'
  }

  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', backgroundColor:'var(--bg)' }}>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, cursor:'zoom-out' }}>
          <img src={lightbox} alt="foto" style={{ maxWidth:'90vw', maxHeight:'90vh', objectFit:'contain', borderRadius:8 }} />
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) sendPhoto(f); e.target.value = '' }} />

      {/* Sidebar */}
      <div style={{ width:280, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <h1 style={{ fontSize:18, fontWeight:900, color:'var(--text)', margin:'0 0 10px' }}>Chat</h1>
          <div style={{ position:'relative' }}>
            <Search size={14} color="var(--text-2)" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
            <input type="text" placeholder="Buscar aluno..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width:'100%', padding:'8px 10px 8px 30px', backgroundColor:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {loadingConvs ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
          ) : conversations.length === 0 ? (
            <p style={{ color:'var(--text-2)', fontSize:14, textAlign:'center', padding:'40px 16px' }}>Nenhum aluno cadastrado ainda.</p>
          ) : conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(conv => (
            <ConvRow key={conv.studentId} conv={conv} isSelected={selected?.studentId === conv.studentId}
              onClick={() => selectConversation(conv)} formatTime={formatTime} lastPreview={lastPreview} />
          ))}
        </div>
      </div>

      {/* Painel de chat */}
      {selected ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <Avatar name={selected.name} />
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{selected.name}</p>
              <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{selected.email}</p>
            </div>
          </div>

          {/* Mensagens */}
          <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:8 }}>
            {loadingMsgs ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}><div style={spin} /></div>
            ) : messages.length === 0 ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <p style={{ color:'var(--text-2)', fontSize:14 }}>Nenhuma mensagem ainda. Diga olá!</p>
              </div>
            ) : messages.map(msg => {
              const isMe = msg.sender_id === user!.id
              return (
                <div key={msg.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth:'65%', padding:'10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', backgroundColor: isMe ? '#E8FF00' : 'var(--surface)' }}>
                    {msg.type === 'audio' && msg.file_url ? (
                      <AudioBubble url={msg.file_url} isMe={isMe} />
                    ) : msg.file_url ? (
                      <img src={msg.file_url} alt="foto" onClick={() => setLightbox(msg.file_url!)}
                        style={{ borderRadius:8, maxWidth:'100%', maxHeight:240, objectFit:'cover', display:'block', cursor:'zoom-in' }} />
                    ) : (
                      <p style={{ fontSize:14, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, color: isMe ? '#0A0A0A' : 'var(--text)' }}>{msg.content}</p>
                    )}
                    <p style={{ fontSize:10, margin:'4px 0 0 0', textAlign:'right', color: isMe ? 'rgba(10,10,10,0.5)' : 'var(--text-2)' }}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
                      {isMe && (msg.read_at ? ' ✓✓' : ' ✓')}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:8, padding:12, borderTop:'1px solid var(--border)', flexShrink:0, backgroundColor:'var(--bg)' }}>
            {isRecording ? (
              <>
                <button onClick={cancelRecording}
                  style={{ width:36, height:36, borderRadius:8, border:'none', backgroundColor:'rgba(255,68,68,0.15)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <X size={16} color="#FF4444" />
                </button>
                <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, padding:'10px 14px', backgroundColor:'var(--surface)', border:'1px solid rgba(255,68,68,0.3)', borderRadius:12 }}>
                  <div style={{ width:8, height:8, borderRadius:4, backgroundColor:'#FF4444', animation:'pulse 1s ease-in-out infinite' }} />
                  <span style={{ fontSize:15, fontWeight:700, color:'#FF4444' }}>{fmtDur(recDuration)}</span>
                  <span style={{ fontSize:13, color:'var(--text-2)' }}>Gravando...</span>
                </div>
                <button onClick={stopAndSendAudio}
                  style={{ width:40, height:40, borderRadius:12, backgroundColor:'#FF4444', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
                  <Send size={16} color="#fff" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ width:36, height:36, borderRadius:8, border:'none', backgroundColor:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--text-2)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <ImageIcon size={18} />
                </button>
                <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
                  placeholder="Digite uma mensagem... (Enter para enviar)" rows={1}
                  style={{ flex:1, padding:'10px 14px', backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, color:'var(--text)', fontSize:14, outline:'none', resize:'none', maxHeight:128, fontFamily:'inherit' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                {text.trim() ? (
                  <button onClick={sendMessage} disabled={!text.trim() || sending}
                    style={{ width:40, height:40, borderRadius:12, backgroundColor:'#E8FF00', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor: !text.trim() || sending ? 'not-allowed' : 'pointer', opacity: !text.trim() || sending ? 0.4 : 1, flexShrink:0 }}>
                    <Send size={16} color="#0A0A0A" />
                  </button>
                ) : (
                  <button onClick={startRecording}
                    style={{ width:40, height:40, borderRadius:12, backgroundColor:'#E8FF00', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
                    <Mic size={16} color="#0A0A0A" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:64, height:64, borderRadius:32, backgroundColor:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <MessageSquare size={24} color="var(--text-2)" />
            </div>
            <p style={{ color:'var(--text)', fontWeight:600, fontSize:14, margin:0 }}>Selecione uma conversa</p>
            <p style={{ color:'var(--text-2)', fontSize:13, marginTop:6 }}>Escolha um aluno na lista ao lado</p>
          </div>
        </div>
      )}
    </div>
  )
}

function AudioBubble({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (isPlaying) { a.pause() } else { a.play() }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const progress = duration > 0 ? (current / duration) * 100 : 0
  const accent = isMe ? '#0A0A0A' : '#E8FF00'
  const muted  = isMe ? 'rgba(10,10,10,0.35)' : 'var(--text-2)'
  const track  = isMe ? 'rgba(10,10,10,0.2)' : 'var(--border)'

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:180, maxWidth:260 }}>
      <audio ref={audioRef} src={url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrent(0) }}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
      />
      <button onClick={toggle}
        style={{ background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0, display:'flex', alignItems:'center', color: accent }}>
        {isPlaying ? <Pause size={32} /> : <Play size={32} />}
      </button>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
        <div onClick={handleSeek} style={{ height:4, backgroundColor: track, borderRadius:2, overflow:'hidden', cursor:'pointer' }}>
          <div style={{ width:`${progress}%`, height:4, backgroundColor: accent, borderRadius:2, transition:'width 0.1s linear' }} />
        </div>
        <span style={{ fontSize:11, color: muted }}>
          {current > 0 ? fmt(current) : fmt(duration)}
        </span>
      </div>
    </div>
  )
}

function ConvRow({ conv, isSelected, onClick, formatTime, lastPreview }: {
  conv: Conversation; isSelected: boolean; onClick: () => void
  formatTime: (s: string) => string; lastPreview: (msg?: string, type?: string) => string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', width:'100%', textAlign:'left', backgroundColor: isSelected || hovered ? 'var(--surface-hover)' : 'transparent', borderBottom:'1px solid var(--border)', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer' }}>
      <Avatar name={conv.name} size={40} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{conv.name}</p>
          {conv.lastAt && <span style={{ fontSize:11, color:'var(--text-2)', flexShrink:0, marginLeft:4 }}>{formatTime(conv.lastAt)}</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:2 }}>
          <p style={{ fontSize:12, color:'var(--text-2)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lastPreview(conv.lastMessage, conv.lastType)}</p>
          {conv.unread > 0 && (
            <span style={{ width:18, height:18, borderRadius:9, backgroundColor:'#E8FF00', color:'#0A0A0A', fontSize:10, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginLeft:4 }}>{conv.unread}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{ width:size, height:size, borderRadius:size/2, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:size*0.375, fontWeight:900, color:'#0A0A0A' }}>
      {name.charAt(0)}
    </div>
  )
}
