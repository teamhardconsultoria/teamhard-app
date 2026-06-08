import { useEffect, useRef, useState } from 'react'
import { Send, Mic, Play, Pause, Paperclip, X, Camera, ImageIcon, File } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Message { id: string; sender_id: string; content: string; type?: string; file_url?: string; created_at: string; read_at?: string }

const spin = { width:24, height:24, border:'2px solid #E8FF00', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }

function getMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

export default function StudentChat() {
  const { user } = useAuthStore()
  const [coachUserId, setCoachUserId] = useState<string | null>(null)
  const [coachName, setCoachName] = useState('Coach')
  const [supportUserId, setSupportUserId] = useState<string | null>(null)
  const [mode, setMode] = useState<'coach' | 'support'>('coach')
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [recDuration, setRecDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const partnerId = mode === 'coach' ? coachUserId : supportUserId

  useEffect(() => {
    const init = async () => {
      const { data: student } = await supabase.from('students').select('id, coach_id').eq('user_id', user!.id).single()
      if (!student) { setLoading(false); return }
      const [coachRes, saRes] = await Promise.all([
        supabase.from('coaches').select('user_id').eq('id', student.coach_id).single(),
        supabase.from('users').select('id').eq('role', 'super_admin').maybeSingle(),
      ])
      if (coachRes.data) {
        const { data: cu } = await supabase.from('users').select('name').eq('id', coachRes.data.user_id).single()
        setCoachUserId(coachRes.data.user_id)
        setCoachName(cu?.name || 'Coach')
      }
      setSupportUserId(saRes.data?.id || null)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!partnerId) return
    setMessages([])
    fetchMessages(partnerId)
    const sub = supabase.channel(`student-chat-${user!.id}-${partnerId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, async (payload) => {
        const msg = payload.new as any
        const mine = (msg.sender_id === user!.id && msg.receiver_id === partnerId) || (msg.sender_id === partnerId && msg.receiver_id === user!.id)
        if (!mine) return
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        if (msg.sender_id === partnerId) await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id)
      }).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [mode, coachUserId, supportUserId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  const fetchMessages = async (pid: string) => {
    const { data } = await supabase.from('messages')
      .select('id, sender_id, content, type, file_url, created_at, read_at')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${pid}),and(sender_id.eq.${pid},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('receiver_id', user!.id).eq('sender_id', pid).is('read_at', null)
  }

  const sendText = async () => {
    if (!text.trim() || !partnerId) return
    setSending(true)
    const content = text.trim(); setText('')
    const { data: inserted } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: partnerId, content, type: 'text' })
      .select('id, sender_id, content, type, file_url, created_at, read_at').single()
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', { body: { user_id: partnerId, title: user!.name || 'Aluno', body: content.length > 80 ? content.slice(0,80)+'…' : content, data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' } })
    setSending(false)
  }

  const sendFile = async (file: File) => {
    if (!partnerId) return
    if (file.size > 3 * 1024 * 1024) { alert('Arquivo muito grande. Limite de 3MB.'); return }
    const isImage = file.type.startsWith('image/')
    const ext = file.name.split('.').pop() || 'bin'
    const filename = `chat/${user!.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('chat-media').upload(filename, file, { contentType: file.type })
    if (upErr) { alert('Erro no upload: ' + upErr.message); return }
    const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
    const { data: inserted } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: partnerId, content: isImage ? '' : file.name, type: isImage ? 'photo' : 'file', file_url: publicUrl })
      .select('id, sender_id, content, type, file_url, created_at, read_at').single()
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', { body: { user_id: partnerId, title: user!.name || 'Aluno', body: isImage ? '📷 Foto' : `📎 ${file.name}`, data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' } })
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getMimeType()
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(); mediaRecorderRef.current = mr; setIsRecording(true); setRecDuration(0)
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000)
    } catch { alert('Não foi possível acessar o microfone.') }
  }

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current; if (!mr) return
    clearInterval(recTimerRef.current!); mr.stream.getTracks().forEach(t => t.stop()); mr.stop()
    mediaRecorderRef.current = null; chunksRef.current = []; setIsRecording(false); setRecDuration(0)
  }

  const stopAndSendAudio = () => {
    const mr = mediaRecorderRef.current; if (!mr || !partnerId) return
    clearInterval(recTimerRef.current!)
    mr.onstop = async () => {
      const mimeType = mr.mimeType || 'audio/webm'
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const filename = `chat/${user!.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('chat-media').upload(filename, blob, { contentType: mimeType })
      if (upErr) { alert('Erro no upload: ' + upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(filename)
      const { data: inserted } = await supabase.from('messages')
        .insert({ sender_id: user!.id, receiver_id: partnerId, content: '', type: 'audio', file_url: publicUrl })
        .select('id, sender_id, content, type, file_url, created_at, read_at').single()
      if (inserted) setMessages(prev => [...prev, inserted])
      supabase.functions.invoke('send-push-notification', { body: { user_id: partnerId, title: user!.name || 'Aluno', body: '🎵 Áudio', data: { screen: mode === 'coach' ? '/(coach)/chat' : '/(admin)/support' }, channel_id: 'messages' } })
    }
    mr.stream.getTracks().forEach(t => t.stop()); mr.stop(); mediaRecorderRef.current = null; setIsRecording(false); setRecDuration(0)
  }

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }
  const fmtDur = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  const partnerName = mode === 'coach' ? coachName : 'Suporte'

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', backgroundColor:'var(--bg)' }}>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth:'90vw', maxHeight:'90vh', objectFit:'contain', borderRadius:8 }} />
        </div>
      )}
      {/* Inputs ocultos para cada tipo de anexo */}
      <input ref={galleryInputRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={fileInputRef}    type="file" accept="*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />

      {/* Menu de anexo (bottom sheet) */}
      {showAttachMenu && (
        <div onClick={() => setShowAttachMenu(false)}
          style={{ position:'fixed', inset:0, zIndex:200, backgroundColor:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width:'100%', backgroundColor:'var(--surface)', borderRadius:'20px 20px 0 0', padding:'8px 0 max(24px, env(safe-area-inset-bottom, 24px))' }}>
            {/* Handle */}
            <div style={{ width:36, height:4, borderRadius:2, backgroundColor:'var(--border)', margin:'8px auto 16px' }} />
            {[
              { icon: <Camera size={22} color="#E8FF00" />, label: 'Câmera',  sub: 'Tirar uma foto agora',       action: () => cameraInputRef.current?.click()  },
              { icon: <ImageIcon size={22} color="#E8FF00" />, label: 'Galeria', sub: 'Escolher foto ou vídeo',    action: () => galleryInputRef.current?.click() },
              { icon: <File size={22} color="#E8FF00" />,    label: 'Arquivo', sub: 'PDF, doc, zip e outros…',   action: () => fileInputRef.current?.click()    },
            ].map(opt => (
              <button key={opt.label} onClick={() => { opt.action(); setShowAttachMenu(false) }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:16, padding:'14px 24px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, rgba(255,255,255,0.04))')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <div style={{ width:44, height:44, borderRadius:12, backgroundColor:'rgba(232,255,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {opt.icon}
                </div>
                <div>
                  <p style={{ fontSize:15, fontWeight:700, color:'var(--text)', margin:0 }}>{opt.label}</p>
                  <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ width:38, height:38, borderRadius:19, backgroundColor:'#E8FF00', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:900, color:'#0A0A0A' }}>{partnerName.charAt(0)}</div>
        <div>
          <p style={{ fontSize:14, fontWeight:700, color:'var(--text)', margin:0 }}>{partnerName}</p>
          <p style={{ fontSize:12, color:'var(--text-2)', margin:0 }}>{mode === 'coach' ? 'Seu Coach' : 'Suporte Método Acelera!'}</p>
        </div>
      </div>

      {/* Tabs */}
      {supportUserId && (
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {(['coach','support'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex:1, padding:'10px', background:'none', border:'none', borderBottom:`2px solid ${mode===m ? '#E8FF00' : 'transparent'}`, cursor:'pointer', fontSize:13, fontWeight:mode===m ? 700 : 500, color: mode===m ? '#E8FF00' : 'var(--text-2)' }}>
              {m === 'coach' ? 'Coach' : 'Suporte'}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:8 }}>
        {loading ? (
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
                {msg.type === 'audio' && msg.file_url
                  ? <AudioBubble url={msg.file_url} isMe={isMe} />
                  : msg.type === 'file' && msg.file_url
                    ? <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none', color: isMe ? '#0A0A0A' : 'var(--text)' }}>
                        <Paperclip size={15} style={{ flexShrink:0 }} />
                        <span style={{ fontSize:13, wordBreak:'break-all' }}>{msg.content || 'Arquivo'}</span>
                      </a>
                    : msg.file_url
                      ? <img src={msg.file_url} alt="" onClick={() => setLightbox(msg.file_url!)} style={{ borderRadius:8, maxWidth:'100%', maxHeight:240, objectFit:'cover', display:'block', cursor:'zoom-in' }} />
                      : <p style={{ fontSize:14, lineHeight:1.5, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, color: isMe ? '#0A0A0A' : 'var(--text)' }}>{msg.content}</p>
                }
                <p style={{ fontSize:10, margin:'4px 0 0', textAlign:'right', color: isMe ? 'rgba(10,10,10,0.5)' : 'var(--text-2)' }}>
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
            <button onClick={cancelRecording} style={{ width:36, height:36, borderRadius:8, border:'none', backgroundColor:'rgba(255,68,68,0.15)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><X size={16} color="#FF4444" /></button>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, padding:'10px 14px', backgroundColor:'var(--surface)', border:'1px solid rgba(255,68,68,0.3)', borderRadius:12 }}>
              <div style={{ width:8, height:8, borderRadius:4, backgroundColor:'#FF4444' }} />
              <span style={{ fontSize:15, fontWeight:700, color:'#FF4444' }}>{fmtDur(recDuration)}</span>
              <span style={{ fontSize:13, color:'var(--text-2)' }}>Gravando...</span>
            </div>
            <button onClick={stopAndSendAudio} style={{ width:40, height:40, borderRadius:12, backgroundColor:'#FF4444', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}><Send size={16} color="#fff" /></button>
          </>
        ) : (
          <>
            <button onClick={() => setShowAttachMenu(v => !v)} title="Enviar anexo"
              style={{ width:36, height:36, borderRadius:8, border:'none', backgroundColor: showAttachMenu ? 'var(--surface)' : 'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color: showAttachMenu ? '#E8FF00' : 'var(--text-2)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
              onMouseLeave={e => { if (!showAttachMenu) e.currentTarget.style.backgroundColor = 'transparent' }}>
              <Paperclip size={18} />
            </button>
            <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey} placeholder="Mensagem... (Enter para enviar)" rows={1}
              style={{ flex:1, padding:'10px 14px', backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, color:'var(--text)', fontSize:14, outline:'none', resize:'none', maxHeight:128, fontFamily:'inherit' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            {text.trim()
              ? <button onClick={sendText} disabled={!text.trim() || sending} style={{ width:40, height:40, borderRadius:12, backgroundColor:'#E8FF00', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1, flexShrink:0 }}><Send size={16} color="#0A0A0A" /></button>
              : <button onClick={startRecording} style={{ width:40, height:40, borderRadius:12, backgroundColor:'#E8FF00', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}><Mic size={16} color="#0A0A0A" /></button>
            }
          </>
        )}
      </div>
    </div>
  )
}

function AudioBubble({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const toggle = () => { const a = audioRef.current; if (!a) return; isPlaying ? a.pause() : a.play() }
  const fmt = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
  const progress = duration > 0 ? (current / duration) * 100 : 0
  const accent = isMe ? '#0A0A0A' : '#E8FF00'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:180, maxWidth:260 }}>
      <audio ref={audioRef} src={url} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => { setIsPlaying(false); setCurrent(0) }} onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)} onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} />
      <button onClick={toggle} style={{ background:'none', border:'none', cursor:'pointer', padding:0, flexShrink:0, color: accent }}>
        {isPlaying ? <Pause size={32} /> : <Play size={32} />}
      </button>
      <div style={{ flex:1 }}>
        <div onClick={() => { const a = audioRef.current; if (!a||!duration) return; const rect = (event as any).currentTarget.getBoundingClientRect(); a.currentTime = (((event as any).clientX - rect.left) / rect.width) * duration }}
          style={{ height:4, backgroundColor: isMe ? 'rgba(10,10,10,0.2)' : 'var(--border)', borderRadius:2, overflow:'hidden', cursor:'pointer', marginBottom:4 }}>
          <div style={{ width:`${progress}%`, height:4, backgroundColor: accent, borderRadius:2 }} />
        </div>
        <span style={{ fontSize:11, color: isMe ? 'rgba(10,10,10,0.5)' : 'var(--text-2)' }}>{current > 0 ? fmt(current) : fmt(duration)}</span>
      </div>
    </div>
  )
}
