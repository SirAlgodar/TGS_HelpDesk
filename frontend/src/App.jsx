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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>TGS Helpdesk</Link></div>
        <nav className="nav">
          <Link to="/">Home</Link>
          {me && <Link to="/user">Portal do Usuário</Link>}
          {me && <Link to="/agent">Tela do Atendente</Link>}
          {me?.role === 'admin' && <Link to="/config">Configurações</Link>}
        </nav>
        <div className="user-meta">
          {me ? (
            <>
              <span>{me.name} ({me.role})</span>
              <button className="button secondary" onClick={() => { setAuthToken(null); navigate('/login') }}>Sair</button>
            </>
          ) : (
            <Link to="/login" className="button secondary">Entrar</Link>
          )}
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  )
}

function Home() {
  const [me, setMe] = useState(null)
  const [tickets, setTickets] = useState([])
  useEffect(() => {
    api.get('/me').then(r => setMe(r.data.user)).catch(() => setMe(null))
    api.get('/tickets')
      .then(r => setTickets(r.data.tickets || []))
      .catch(() => setTickets([]))
  }, [])

  const total = tickets.length
  const byStatus = tickets.reduce((acc, t) => {
    const s = (t.status || 'unknown').toLowerCase()
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const abertos = byStatus.open || byStatus.aberto || 0
  const andamento = byStatus.in_progress || byStatus.em_andamento || 0
  const resolvidos = byStatus.resolved || byStatus.resolvido || 0

  return (
    <div className="section">
      <h2 className="page-title">Helpdesk Simples</h2>
      <p className="helper">Abra chamados, comente e gerencie SLAs.</p>
      {me ? (
        <div className="kpis">
          <div className="kpi card">
            <div className="kpi-title">Total de Tickets</div>
            <div className="kpi-value">{total}</div>
          </div>
          <div className="kpi card">
            <div className="kpi-title">Abertos</div>
            <div className="kpi-value">{abertos}</div>
          </div>
          <div className="kpi card">
            <div className="kpi-title">Em andamento</div>
            <div className="kpi-value">{andamento}</div>
          </div>
          <div className="kpi card">
            <div className="kpi-title">Resolvidos</div>
            <div className="kpi-value">{resolvidos}</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="helper">Para visualizar KPIs, faça login.</div>
          <div className="actions"><Link to="/login" className="button">Entrar</Link></div>
        </div>
      )}
    </div>
  )
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
    <div className="login-wrapper">
      <div className="card login-card">
        <h2 className="page-title" style={{ textAlign: 'center' }}>Sistema de Tickets</h2>
        {error && <div className="helper status-err" style={{ marginBottom: 8 }}>{error}</div>}
        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input" />
          </div>
          <div className="field">
            <label htmlFor="password" className="label">Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required className="input" style={{ paddingRight: 90 }} />
              <button type="button" onClick={() => setShowPassword(s => !s)} className="button secondary" style={{ position: 'absolute', right: 6, top: 6 }}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <div className="actions">
            <button type="submit" className="button">Entrar</button>
          </div>
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

function UsersManagement() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const [error, setError] = useState('')
  const load = () => api.get('/admin/users').then(r => setUsers(r.data.users)).catch(err => setError(err.response?.data?.error || 'Erro ao carregar'))
  useEffect(() => { load() }, [])

  const createUser = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/admin/users', form)
      setForm({ name: '', email: '', password: '', role: 'user' })
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar usuário')
    }
  }

  const updateUser = async (id, patch) => {
    try {
      await api.patch(`/admin/users/${id}`, patch)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar usuário')
    }
  }

  const deleteUser = async (id) => {
    if (!confirm('Excluir este usuário?')) return
    try {
      await api.delete(`/admin/users/${id}`)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir usuário')
    }
  }

  return (
    <div className="section">
      <h4 className="section-title">Usuários</h4>
      {error && <div className="helper status-err">{error}</div>}
      <div className="card" style={{ maxWidth: 520 }}>
        <form onSubmit={createUser} className="form">
          <input className="input" placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Senha" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="user">Usuário</option>
            <option value="agent">Agente</option>
            <option value="admin">Admin</option>
          </select>
          <div className="actions"><button type="submit" className="button">Criar</button></div>
        </form>
      </div>
      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>ID</th><th>Nome</th><th>Email</th><th>Papel</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select className="select" defaultValue={u.role} onChange={e => updateUser(u.id, { role: e.target.value })}>
                  <option value="user">Usuário</option>
                  <option value="agent">Agente</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td>
                <button className="button danger" onClick={() => deleteUser(u.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IntegrationSettings() {
  const [settings, setSettings] = useState({ webhook_outgoing_url: '', webhook_incoming_secret: '', api_base_url: '', api_token: '' })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/admin/settings/integration').then(r => setSettings({ ...settings, ...r.data.settings })).catch(err => setError(err.response?.data?.error || 'Erro ao carregar'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setError(''); setStatus('')
    try {
      await api.put('/admin/settings/integration', settings)
      setStatus('Configurações salvas!')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar')
    }
  }

  const testOutgoing = async () => {
    setError(''); setStatus('')
    try {
      const r = await api.post('/admin/settings/integration/test-outgoing', { url: settings.webhook_outgoing_url })
      setStatus(`Webhook OK (status ${r.data.status})`)
    } catch (err) {
      setError(err.response?.data?.error || 'Falha ao testar webhook')
    }
  }

  const incomingUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/webhooks/incoming`

  return (
    <div className="section">
      <h4 className="section-title">Integração</h4>
      {error && <div className="helper status-err">{error}</div>}
      {status && <div className="helper status-ok">{status}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="form">
          <div className="field">
            <label className="label">Webhook de saída (URL)</label>
            <input className="input" value={settings.webhook_outgoing_url || ''} onChange={e => setSettings({ ...settings, webhook_outgoing_url: e.target.value })} placeholder="https://example.com/webhook" />
          </div>
          <div className="actions">
            <button className="button secondary" onClick={testOutgoing}>Testar webhook de saída</button>
          </div>
          <div className="field">
            <label className="label">Webhook de entrada (segredo)</label>
            <input className="input" value={settings.webhook_incoming_secret || ''} onChange={e => setSettings({ ...settings, webhook_incoming_secret: e.target.value })} placeholder="segredo-para-validacao" />
            <div className="helper">Endpoint: {incomingUrl} — envie cabeçalho <code>x-webhook-secret</code> com o segredo.</div>
          </div>
          <div className="field">
            <label className="label">API Base URL</label>
            <input className="input" value={settings.api_base_url || ''} onChange={e => setSettings({ ...settings, api_base_url: e.target.value })} placeholder="https://api.externa.com" />
          </div>
          <div className="field">
            <label className="label">API Token</label>
            <input className="input" value={settings.api_token || ''} onChange={e => setSettings({ ...settings, api_token: e.target.value })} placeholder="token" />
          </div>
          <div className="actions">
            <button className="button" onClick={save}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Config() {
  const [tab, setTab] = useState('users')
  const [me, setMe] = useState(null)
  useEffect(() => { api.get('/me').then(r => setMe(r.data.user)).catch(() => setMe(null)) }, [])
  if (!me || me.role !== 'admin') return (
    <div className="section">
      <h3 className="page-title">Configurações</h3>
      <div className="helper status-err">Acesso negado. Apenas administradores.</div>
    </div>
  )
  return (
    <div className="section">
      <h3 className="page-title">Configurações</h3>
      <div className="tabs">
        <button className="tab" onClick={() => setTab('users')} disabled={tab==='users'}>Usuário</button>
        <button className="tab" onClick={() => setTab('integration')} disabled={tab==='integration'}>Integração</button>
      </div>
      {tab === 'users' ? <UsersManagement /> : <IntegrationSettings />}
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
            <Route path="/config" element={<Config />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
