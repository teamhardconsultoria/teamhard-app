import { useEffect, useRef, useState } from 'react'
import { Search, Send, Headphones } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/auth'

interface Partner {
  userId: string
  name: string
  role: 'coach' | 'student' | string
  lastMessage: string
  lastAt: string
  unread: number
}

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
  read_at?: string
}

const spin: React.CSSProperties = { width: 24, height: 24, border: '2px solid #E8FF00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }

export default function SupportChat() {
  const { user } = useAuthStore()
  const [partners, setPartners] = useState<Partner[]>([])
  const [filtered, setFiltered] = useState<Partner[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Partner | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => { loadPartners() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(partners.filter(p => p.name.toLowerCase().includes(q)))
  }, [search, partners])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadPartners = async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, content, created_at, read_at')
      .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
      .order('created_at', { ascending: false })

    if (!msgs) { setLoadingPartners(false); return }

    // Collect unique partner IDs and their data
    const map = new Map<string, { lastMessage: string; lastAt: string; unread: number }>()
    for (const m of msgs) {
      const pid = m.sender_id === user!.id ? m.receiver_id : m.sender_id
      if (!map.has(pid)) map.set(pid, { lastMessage: m.content, lastAt: m.created_at, unread: 0 })
      if (m.receiver_id === user!.id && !m.read_at) map.get(pid)!.unread++
    }

    if (map.size === 0) { setLoadingPartners(false); return }

    const ids = [...map.keys()]
    const { data: users } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', ids)

    const result: Partner[] = (users || []).map(u => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      ...map.get(u.id)!,
    }))
    result.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    setPartners(result)
    setFiltered(result)
    setLoadingPartners(false)
  }

  const selectPartner = async (p: Partner) => {
    setSelected(p)
    setLoadingMsgs(true)

    channelRef.current?.unsubscribe()
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, content, created_at, read_at')
      .or(`and(sender_id.eq.${user!.id},receiver_id.eq.${p.userId}),and(sender_id.eq.${p.userId},receiver_id.eq.${user!.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMsgs(false)

    await supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('sender_id', p.userId).eq('receiver_id', user!.id).is('read_at', null)
    setPartners(prev => prev.map(x => x.userId === p.userId ? { ...x, unread: 0 } : x))
    setFiltered(prev => prev.map(x => x.userId === p.userId ? { ...x, unread: 0 } : x))

    channelRef.current = supabase.channel(`support-admin-${p.userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${p.userId}` }, payload => {
        const m = payload.new as Message
        if (m.sender_id === p.userId) setMessages(prev => [...prev, m])
      }).subscribe()
  }

  const send = async () => {
    if (!text.trim() || !selected) return
    setSending(true)
    const content = text.trim(); setText('')
    const { data: inserted } = await supabase.from('messages')
      .insert({ sender_id: user!.id, receiver_id: selected.userId, content, type: 'text' })
      .select('id, sender_id, content, created_at, read_at').single()
    if (inserted) setMessages(prev => [...prev, inserted])
    supabase.functions.invoke('send-push-notification', {
      body: { user_id: selected.userId, title: 'Suporte TeamHard', body: content.length > 80 ? content.slice(0, 80) + '…' : content, data: { screen: '/(student)/chat' }, channel_id: 'messages' },
    })
    setSending(false)
    loadPartners()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const roleLabel = (role: string) => role === 'coach' ? 'Coach' : 'Aluno'
  const roleColor = (role: string) => role === 'coach' ? '#3B82F6' : '#E8FF00'

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>

      {/* Sidebar */}
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(232,255,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Headphones size={18} color="#E8FF00" />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Suporte</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>{partners.length} conversa{partners.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-2)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 30px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingPartners ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={spin} /></div>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'var(--text-2)', fontSize: 13, textAlign: 'center', padding: '40px 16px' }}>
              {search ? 'Nenhum resultado.' : 'Nenhuma mensagem de suporte ainda.'}
            </p>
          ) : filtered.map(p => {
            const isSel = selected?.userId === p.userId
            return (
              <button key={p.userId} onClick={() => selectPartner(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', width: '100%', textAlign: 'left', backgroundColor: isSel ? 'var(--surface-hover)' : 'transparent', borderBottom: '1px solid var(--border)', border: 'none', borderBottomColor: 'var(--border)', borderBottomWidth: 1, borderBottomStyle: 'solid', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)' }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: roleColor(p.role), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
                  {p.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <span style={{ fontSize: 10, fontWeight: 700, color: roleColor(p.role), backgroundColor: `${roleColor(p.role)}18`, border: `1px solid ${roleColor(p.role)}33`, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                        {roleLabel(p.role)}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{formatTime(p.lastAt)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.lastMessage}</p>
                    {p.unread > 0 && (
                      <span style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E8FF00', color: '#0A0A0A', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 4 }}>{p.unread}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chat panel */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: roleColor(selected.role), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#0A0A0A', flexShrink: 0 }}>
              {selected.name.charAt(0)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{selected.name}</p>
                <span style={{ fontSize: 11, fontWeight: 700, color: roleColor(selected.role), backgroundColor: `${roleColor(selected.role)}18`, border: `1px solid ${roleColor(selected.role)}33`, padding: '2px 8px', borderRadius: 10 }}>
                  {roleLabel(selected.role)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingMsgs ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div style={spin} /></div>
            ) : messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Nenhuma mensagem ainda.</p>
              </div>
            ) : messages.map(msg => {
              const isMe = msg.sender_id === user!.id
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', backgroundColor: isMe ? '#E8FF00' : 'var(--border)' }}>
                    <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: isMe ? '#0A0A0A' : 'var(--text)' }}>{msg.content}</p>
                    <p style={{ fontSize: 10, marginTop: 4, textAlign: 'right', margin: '4px 0 0', color: isMe ? 'rgba(10,10,10,0.5)' : 'var(--text-2)' }}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
              placeholder="Digite uma mensagem... (Enter para enviar)" rows={1}
              style={{ flex: 1, padding: '10px 14px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'none', maxHeight: 128, fontFamily: 'inherit' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#E8FF00')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
            <button onClick={send} disabled={!text.trim() || sending}
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8FF00', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !text.trim() || sending ? 'not-allowed' : 'pointer', opacity: !text.trim() || sending ? 0.4 : 1, flexShrink: 0 }}>
              <Send size={16} color="#0A0A0A" />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Headphones size={24} color="var(--text-2)" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, margin: 0 }}>Selecione uma conversa</p>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>Responda coaches e alunos pelo suporte</p>
          </div>
        </div>
      )}
    </div>
  )
}
