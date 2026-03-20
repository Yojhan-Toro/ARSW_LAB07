import { useEffect, useRef, useState, useCallback } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { createSocket } from './lib/socketIoClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const IO_BASE  = import.meta.env.VITE_IO_BASE  ?? 'http://localhost:3001'
const STOMP_BASE = import.meta.env.VITE_STOMP_BASE ?? 'http://localhost:8080'


function baseFor(tech) {
  return tech === 'stomp' ? STOMP_BASE : tech === 'socketio' ? IO_BASE : API_BASE
}

function redraw(canvas, points) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.strokeStyle = '#f0f1f4'
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (let y = 0; y <= canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }
  ctx.restore()

  if (!points || points.length === 0) return

  ctx.save()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.stroke()
  ctx.restore()

  points.forEach((p, i) => {
    ctx.save()
    ctx.fillStyle = i === points.length - 1 ? '#2563eb' : '#93b4f9'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  })
}

export default function App() {
  const [tech, setTech]       = useState('stomp')
  const [author, setAuthor]   = useState('juan')
  const [bpName, setBpName]   = useState('plano-1')
  const [authorInput, setAuthorInput] = useState('juan')
  const [bpNameInput, setBpNameInput] = useState('plano-1')
  const [points, setPoints]   = useState([])
  const [blueprints, setBlueprints] = useState([])
  const [totalPts, setTotalPts]     = useState(0)
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(false)

  const [newAuthor, setNewAuthor] = useState('')
  const [newName,   setNewName]   = useState('')

  const canvasRef  = useRef(null)
  const stompRef   = useRef(null)
  const unsubRef   = useRef(null)
  const socketRef  = useRef(null)
  const pointsRef  = useRef([])

  useEffect(() => { pointsRef.current = points }, [points])


  useEffect(() => {
    redraw(canvasRef.current, points)
  }, [points])


  const loadAuthorBlueprints = useCallback(async (targetAuthor) => {
    if (!targetAuthor) return
    try {
      const r = await fetch(`${API_BASE}/api/blueprints?author=${targetAuthor}`)
      if (!r.ok) { setBlueprints([]); setTotalPts(0); return }
      const data = await r.json()
      setBlueprints(data)
      const total = data.reduce((acc, bp) => acc + (bp.pointCount ?? bp.points?.length ?? 0), 0)
      setTotalPts(total)
    } catch {
      setBlueprints([]); setTotalPts(0)
    }
  }, [])


  const loadBlueprint = useCallback(async (a, n) => {
    if (!a || !n) return
    setLoading(true)
    try {
      const base = tech === 'socketio' ? IO_BASE : API_BASE
      const r = await fetch(`${base}/api/blueprints/${a}/${n}`)
      if (!r.ok) { setPoints([]); setLoading(false); return }
      const data = await r.json()
      setPoints(data.points ?? [])
    } catch {
      setPoints([])
    }
    setLoading(false)
  }, [tech])


  useEffect(() => {
    loadBlueprint(author, bpName)
    loadAuthorBlueprints(author)
  }, [author, bpName, tech])

  useEffect(() => {
    unsubRef.current?.(); unsubRef.current = null
    stompRef.current?.deactivate?.(); stompRef.current = null
    socketRef.current?.disconnect?.(); socketRef.current = null

    if (tech === 'stomp') {
      const client = createStompClient(STOMP_BASE)
      stompRef.current = client
      client.onConnect = () => {
        setStatus('STOMP conectado')
        unsubRef.current = subscribeBlueprint(client, author, bpName, (upd) => {
          setPoints(upd.points ?? [])
          setBlueprints(prev => prev.map(b =>
            b.name === upd.name && b.author === upd.author
              ? { ...b, pointCount: (upd.points ?? []).length }
              : b
          ))
          loadAuthorBlueprints(upd.author)
        })
      }
      client.onDisconnect = () => setStatus('STOMP desconectado')
      client.activate()
    } else if (tech === 'socketio') {
      const s = createSocket(IO_BASE)
      socketRef.current = s
      s.on('connect', () => setStatus('Socket.IO conectado'))
      s.on('disconnect', () => setStatus('Socket.IO desconectado'))
      const room = `blueprints.${author}.${bpName}`
      s.emit('join-room', room)
      s.on('blueprint-update', (upd) => setPoints(upd.points ?? []))
    } else {
      setStatus('Sin tiempo real (solo REST)')
    }

    return () => {
      unsubRef.current?.(); unsubRef.current = null
      stompRef.current?.deactivate?.()
      socketRef.current?.disconnect?.()
    }
  }, [tech, author, bpName])


  function onCanvasClick(e) {
    const rect = e.target.getBoundingClientRect()
    const point = {
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    }

    if (tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author, name: bpName, point }),
      })
    } else if (tech === 'socketio' && socketRef.current?.connected) {
      const room = `blueprints.${author}.${bpName}`
      socketRef.current.emit('draw-event', { room, author, name: bpName, point })
    } else {
      setPoints(prev => [...prev, point])
    }
  }


  async function handleCreate() {
    const a = newAuthor.trim() || author
    const n = newName.trim()
    if (!n) { setStatus('Escribe un nombre para el nuevo plano'); return }
    const r = await fetch(`${API_BASE}/api/blueprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: a, name: n, points: [] }),
    })
    if (r.ok) {
      setStatus(`Plano "${n}" creado`)
      setAuthor(a); setBpName(n)
      setAuthorInput(a); setBpNameInput(n)
      setNewName(''); setNewAuthor('')
      await loadAuthorBlueprints(a)
    } else {
      const err = await r.json()
      setStatus(err.error ?? 'Error al crear')
    }
  }

  async function handleSave() {
    if (!author || !bpName) { setStatus('Autor y nombre requeridos'); return }
    try {
      const r = await fetch(`${API_BASE}/api/blueprints/${author}/${bpName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, name: bpName, points }),
      })
      if (r.ok) {
        setStatus('Plano guardado')
        await loadAuthorBlueprints(author)
      } else {
        const body = await r.json().catch(() => ({}))
        setStatus(body.error ?? `Error ${r.status}`)
      }
    } catch (err) {
      setStatus('Error de red: ' + err.message)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar plano "${bpName}" de ${author}?`)) return
    const r = await fetch(`${API_BASE}/api/blueprints/${author}/${bpName}`, {
      method: 'DELETE',
    })
    if (r.ok) {
      setStatus(`Plano "${bpName}" eliminado`)
      setPoints([])
      await loadAuthorBlueprints(author)
      const remaining = blueprints.filter(b => b.name !== bpName)
      if (remaining.length > 0) setBpName(remaining[0].name)
      else setBpName('')
    } else {
      setStatus('Error al eliminar')
    }
  }

  function handleSelectBlueprint(bp) {
    setAuthor(bp.author)
    setBpName(bp.name)
    setAuthorInput(bp.author)
    setBpNameInput(bp.name)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #f5f6f8;
          --surface: #ffffff;
          --surface2: #f0f1f4;
          --border: #e2e4e9;
          --border-strong: #c8ccd6;
          --accent: #2563eb;
          --accent-light: #eff4ff;
          --accent-hover: #1d4ed8;
          --red: #dc2626;
          --red-light: #fef2f2;
          --green: #16a34a;
          --text: #111827;
          --text-mid: #4b5563;
          --text-dim: #9ca3af;
          --font: 'DM Sans', sans-serif;
          --font-mono: 'DM Mono', monospace;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04);
          --shadow: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font);
          min-height: 100vh;
        }

        .app {
          display: grid;
          grid-template-rows: auto 1fr auto;
          min-height: 100vh;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          gap: 20px;
        }

        /* ── header ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 20px;
          box-shadow: var(--shadow-sm);
        }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header-logo {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 1rem;
        }
        .header h1 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .header h1 span { color: var(--text-dim); font-weight: 400; }
        .status-badge {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          padding: 5px 12px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--surface2);
          color: var(--text-mid);
        }

        /* ── layout ── */
        .main {
          display: grid;
          grid-template-columns: 272px 1fr;
          gap: 16px;
          align-items: start;
        }

        /* ── sidebar ── */
        .sidebar { display: flex; flex-direction: column; gap: 12px; }

        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }
        .card-title {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-dim);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* selector RT */
        .rt-selector { display: flex; flex-direction: column; gap: 4px; }
        .rt-btn {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--text-mid);
          font-family: var(--font);
          font-size: 0.85rem;
          padding: 8px 10px;
          cursor: pointer;
          text-align: left;
          transition: all 0.12s;
          display: flex; align-items: center; gap: 8px;
        }
        .rt-btn::before {
          content: '';
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--border-strong);
          flex-shrink: 0;
          transition: background 0.12s;
        }
        .rt-btn:hover { background: var(--surface2); color: var(--text); }
        .rt-btn.active {
          background: var(--accent-light);
          border-color: #bfcffd;
          color: var(--accent);
          font-weight: 500;
        }
        .rt-btn.active::before { background: var(--accent); }

        /* inputs */
        .input-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
        .input-group { display: flex; flex-direction: column; gap: 4px; }
        label {
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--text-mid);
        }
        input[type="text"] {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-family: var(--font);
          font-size: 0.875rem;
          padding: 7px 10px;
          outline: none;
          transition: border-color 0.12s, box-shadow 0.12s;
          width: 100%;
        }
        input[type="text"]:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
          background: white;
        }

        /* tabla */
        .bp-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
        .bp-table th {
          color: var(--text-dim);
          text-align: left;
          padding: 5px 8px;
          border-bottom: 1px solid var(--border);
          font-weight: 500;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .bp-table td {
          padding: 7px 8px;
          border-bottom: 1px solid var(--border);
          color: var(--text);
          cursor: pointer;
        }
        .bp-table tr:last-child td { border-bottom: none; }
        .bp-table tr:hover td { background: var(--surface2); }
        .bp-table tr.selected td {
          background: var(--accent-light);
          color: var(--accent);
          font-weight: 500;
        }
        .bp-table .pts { color: var(--text-dim); text-align: right; font-family: var(--font-mono); }
        .bp-table tr.selected .pts { color: var(--accent); }
        .total-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
          color: var(--text-mid);
        }
        .total-row span:last-child { color: var(--text); font-weight: 600; font-family: var(--font-mono); }

        /* botones */
        .actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid;
          font-family: var(--font);
          font-weight: 500;
          font-size: 0.84rem;
          cursor: pointer;
          transition: all 0.12s;
        }
        .btn-primary {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }
        .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: var(--shadow-sm); }
        .btn-secondary {
          background: white;
          border-color: var(--border);
          color: var(--text-mid);
        }
        .btn-secondary:hover { border-color: var(--border-strong); color: var(--text); background: var(--surface2); }
        .btn-danger {
          background: white;
          border-color: var(--border);
          color: var(--red);
        }
        .btn-danger:hover { background: var(--red-light); border-color: #fca5a5; }

        /* ── canvas area ── */
        .canvas-area { display: flex; flex-direction: column; gap: 10px; }
        .canvas-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.82rem;
          color: var(--text-mid);
        }
        .canvas-info .bp-id {
          font-weight: 600;
          color: var(--text);
          font-size: 0.95rem;
        }
        .canvas-wrap { position: relative; }
        canvas {
          display: block;
          background: white;
          border: 1px solid var(--border);
          border-radius: 10px;
          cursor: crosshair;
          width: 100%;
          max-width: 860px;
          box-shadow: var(--shadow-sm);
        }
        canvas:hover { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.08); }
        .canvas-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          font-size: 0.85rem;
          color: var(--text-dim);
          border-radius: 10px;
        }
        .hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          text-align: center;
        }
        .hint span { color: var(--accent); font-weight: 500; }

        /* ── footer ── */
        .footer {
          border-top: 1px solid var(--border);
          padding-top: 12px;
          font-size: 0.75rem;
          color: var(--text-dim);
          display: flex;
          gap: 20px;
        }

        @media (max-width: 700px) {
          .main { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="app">
        <header className="header">
          <div className="header-left">
            <div className="header-logo">⬡</div>
            <h1>BluePrints <span>Real-Time</span></h1>
          </div>
          <div className="status-badge">{status || 'sin conexión RT'}</div>
        </header>
        <div className="main">
          <aside className="sidebar">
            <div className="card">
              <div className="card-title">// tecnología RT</div>
              <div className="rt-selector">
                {[
                  { key: 'stomp',    label: 'STOMP  (Spring Boot)' },
                  { key: 'socketio', label: 'Socket.IO  (Node)' },
                  { key: 'none',     label: 'Sin RT  (solo REST)' },
                ].map(t => (
                  <button
                    key={t.key}
                    className={`rt-btn ${tech === t.key ? 'active' : ''}`}
                    onClick={() => setTech(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title">// plano activo</div>
              <div className="input-row">
                <div className="input-group">
                  <label>Autor</label>
                  <input
                    type="text"
                    value={authorInput}
                    onChange={e => setAuthorInput(e.target.value)}
                    onBlur={() => { setAuthor(authorInput); setBpName('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { setAuthor(authorInput); setBpName('') } }}
                    placeholder="juan"
                  />
                </div>
                <div className="input-group">
                  <label>Plano</label>
                  <input
                    type="text"
                    value={bpNameInput}
                    onChange={e => setBpNameInput(e.target.value)}
                    onBlur={() => setBpName(bpNameInput)}
                    onKeyDown={e => { if (e.key === 'Enter') setBpName(bpNameInput) }}
                    placeholder="plano-1"
                  />
                </div>
              </div>
              <div className="actions">
                <button className="btn btn-primary" onClick={handleSave}>Save</button>
                <button className="btn btn-danger"  onClick={handleDelete}>Delete</button>
              </div>
            </div>
            <div className="card">
              <div className="card-title">// crear plano</div>
              <div className="input-row">
                <div className="input-group">
                  <label>Autor (opcional)</label>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={e => setNewAuthor(e.target.value)}
                    placeholder={author}
                  />
                </div>
                <div className="input-group">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="nuevo-plano"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>
              </div>
              <button className="btn btn-secondary" style={{width:'100%'}} onClick={handleCreate}>
                + Create
              </button>
            </div>
            <div className="card">
              <div className="card-title">// planos de {author}</div>
              {blueprints.length === 0 ? (
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-dim)' }}>
                  Sin planos. Crea uno.
                </div>
              ) : (
                <table className="bp-table">
                  <thead>
                    <tr>
                      <th>nombre</th>
                      <th className="pts">pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blueprints.map(bp => (
                      <tr
                        key={bp.name}
                        className={bp.name === bpName ? 'selected' : ''}
                        onClick={() => handleSelectBlueprint(bp)}
                      >
                        <td>{bp.name}</td>
                        <td className="pts">{bp.pointCount ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="total-row">
                <span>Total puntos:</span>
                <span>{totalPts}</span>
              </div>
            </div>

          </aside>
          <div className="canvas-area">
            <div className="canvas-info">
              <span className="bp-id">
                {author || '—'}/{bpName || '—'}
              </span>
              <span>{points.length} punto{points.length !== 1 ? 's' : ''}{loading ? ' · cargando…' : ''}</span>
            </div>
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                width={860}
                height={520}
                onClick={onCanvasClick}
              />
              {points.length === 0 && !loading && (
                <div className="canvas-overlay">
                  <span>haz clic para dibujar</span>
                </div>
              )}
            </div>
            <p className="hint">
              Tip: abre <span>2 pestañas</span> con el mismo autor/plano y dibuja para ver colaboración en vivo.
            </p>
          </div>

        </div>
        <footer className="footer">
          <span>BluePrints RT · Lab P4</span>
          <span>STOMP → /app/draw · /topic/blueprints.{'{author}'}.{'{name}'}</span>
        </footer>

      </div>
    </>
  )
}
