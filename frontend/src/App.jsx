import { useEffect, useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import './App.css'
import { api, setAuthToken } from './api'

function Layout({ children }) {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  useEffect(() => {
    api.get('/me').then(r => setMe(r.data.user)).catch(() => setMe(null))
  }, [])
  return (
    <div>
      <nav style={{ display: 'flex', gap: 12, padding: 10, borderBottom: '1px solid #ddd' }}>
        <Link to="/">Home</Link>
        {me && <Link to="/user">Portal do Usuário</Link>}
        {me && <Link to="/agent">Tela do Atendente</Link>}
        {me ? (
          <span style={{ marginLeft: 'auto' }}>
            {me.name} ({me.role})
            <button style={{ marginLeft: 8 }} onClick={() => { setAuthToken(null); navigate('/login') }}>Sair</button>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto' }}>
            <Link to="/login">Entrar</Link>
          </span>
        )}
      </nav>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function Home() {
  return <div>
    <h2>Helpdesk Simples</h2>
    <p>Abra chamados, comente e gerencie SLAs.</p>
  </div>
}

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const r = await api.post('/auth/login', { email, password })
      setAuthToken(r.data.token)
      const role = r?.data?.user?.role
      if (role === 'agent' || role === 'admin') {
        navigate('/agent')
      } else {
        navigate('/user')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro no login')
    }
  }
  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ 
        maxWidth: 400, 
        width: '100%',
        padding: 40,
        backgroundColor: 'white',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: 30, color: '#333' }}>Sistema de Tickets</h2>
        {error && <div style={{ color: 'red', marginBottom: 15, padding: 10, backgroundColor: '#fee', borderRadius: 4, fontSize: 14 }}>{error}</div>}
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label htmlFor="email" style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#555' }}>Email:</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: 12, 
                border: '1px solid #ddd', 
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#555' }}>Senha:</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ 
                  width: '100%', 
                  padding: 12, 
                  border: '1px solid #ddd', 
                  borderRadius: 6, 
                  paddingRight: 45,
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button 
            type="submit" 
            style={{ 
              padding: 12, 
              backgroundColor: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: 6, 
              cursor: 'pointer',
              fontSize: 16,
              fontWeight: 500,
              marginTop: 10
            }}
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}


function UserPortal() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [tickets, setTickets] = useState([])
  const [error, setError] = useState('')
  const load = () => api.get('/tickets').then(r => setTickets(r.data.tickets)).catch(() => setTickets([]))
  useEffect(() => { load() }, [])
  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/tickets', { title, description, priority })
      setTitle(''); setDescription(''); setPriority('medium');
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao abrir chamado')
    }
  }
  return (
    <div>
      <h3>Portal do Usuário</h3>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
        <input placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} />
        <select value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
        </select>
        <button type="submit">Abrir chamado</button>
        {error && <div style={{ color: 'red' }}>{error}</div>}
      </form>
      <h4>Meus chamados</h4>
      <TicketList tickets={tickets} />
    </div>
  )
}

function TicketList({ tickets, onStatusChange }) {
  return (
    <table style={{ width: '100%', marginTop: 12 }}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Título</th>
          <th>Status</th>
          <th>Prioridade</th>
          <th>Resposta até</th>
          <th>Resolução até</th>
          {onStatusChange && <th>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {tickets?.map(t => (
          <tr key={t.id}>
            <td>{t.id}</td>
            <td>{t.title}</td>
            <td>{t.status}</td>
            <td>{t.priority}</td>
            <td>{t.response_due_at ? new Date(t.response_due_at).toLocaleString() : '-'}</td>
            <td>{t.resolution_due_at ? new Date(t.resolution_due_at).toLocaleString() : '-'}</td>
            {onStatusChange && (
              <td>
                <select defaultValue={t.status} onChange={e => onStatusChange(t.id, e.target.value)}>
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="pending">Pendente</option>
                  <option value="resolved">Resolvido</option>
                  <option value="closed">Fechado</option>
                </select>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AgentDashboard() {
  const [tickets, setTickets] = useState([])
  const [error, setError] = useState('')
  const load = () => api.get('/tickets').then(r => setTickets(r.data.tickets)).catch(err => setError(err.response?.data?.error || 'Erro ao carregar'))
  useEffect(() => { load() }, [])
  const onStatusChange = async (id, status) => {
    try {
      await api.patch(`/tickets/${id}`, { status })
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar status')
    }
  }
  return (
    <div>
      <h3>Tela do Atendente</h3>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <TicketList tickets={tickets} onStatusChange={onStatusChange} />
    </div>
  )
}

function Comments({ ticketId }) {
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const load = () => api.get(`/tickets/${ticketId}/comments`).then(r => setComments(r.data.comments))
  useEffect(() => { load() }, [ticketId])
  const onSubmit = async (e) => {
    e.preventDefault()
    const form = new FormData()
    form.append('body', body)
    for (const f of files) form.append('files', f)
    await api.post(`/tickets/${ticketId}/comments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    setBody(''); setFiles([]); load()
  }
  return (
    <div>
      <h4>Comentários</h4>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
        <textarea placeholder="Comentário" value={body} onChange={e => setBody(e.target.value)} />
        <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files))} />
        <button type="submit">Enviar</button>
      </form>
      <ul>
        {comments.map(c => (
          <li key={c.id}>
            <div><b>{c.user_id}</b> em {new Date(c.created_at).toLocaleString()}</div>
            <div>{c.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TicketView() {
  const [ticketId, setTicketId] = useState('')
  const [ticket, setTicket] = useState(null)
  const load = async () => {
    if (!ticketId) return
    const r = await api.get(`/tickets/${ticketId}`)
    setTicket(r.data.ticket)
  }
  return (
    <div>
      <h3>Detalhe do Chamado</h3>
      <div>
        <input placeholder="ID do chamado" value={ticketId} onChange={e => setTicketId(e.target.value)} />
        <button onClick={load}>Carregar</button>
      </div>
      {ticket && (
        <div style={{ marginTop: 12 }}>
          <div><b>{ticket.title}</b> — {ticket.status}</div>
          <div>{ticket.description}</div>
          <div>Resposta até: {ticket.response_due_at ? new Date(ticket.response_due_at).toLocaleString() : '-'}</div>
          <div>Resolução até: {ticket.resolution_due_at ? new Date(ticket.resolution_due_at).toLocaleString() : '-'}</div>
          <Comments ticketId={ticket.id} />
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/user" element={<UserPortal />} />
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/ticket" element={<TicketView />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
