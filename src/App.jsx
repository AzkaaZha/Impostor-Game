import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom'
import {
  ref,
  set,
  push,
  onValue,
  update,
  get,
  remove,
} from 'firebase/database'
import { db } from './firebase'
function randomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}
function HomePage() {
  const [joinCode, setJoinCode] = useState('')
  const navigate = useNavigate()
  const createRoom = async () => {
    const roomId = randomCode()
    const roomRef = ref(db, `rooms/${roomId}`)
    await set(roomRef, {
      roomId,
      phase: 'lobby',
      createdAt: Date.now(),
      hostLabel: 'Host',
      settings: {
        normalWord: '',
        impostorWord: '',
      },
      players: {},
      votes: {},
      result: null,
    })
    navigate(`/host/${roomId}`)
  }
  const handleJoin = () => {
    if (!joinCode.trim()) return
    navigate(`/join/${joinCode.trim().toUpperCase()}`)
  }
  return (
    <div className="page center-page">
      <div className="card hero-card">
        <span className="badge">Game Sederhana</span>
        <h1>Tebak Impostor</h1>
        <p className="subtitle">
          Host buat room, pemain join lewat link, lalu main dan voting
          langsung dari HP.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={createRoom}>
            Buat Room sebagai Host
          </button>
        </div>
        <div className="join-box">
          <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Masukkan kode room"
          />
          <button className="btn btn-secondary" onClick={handleJoin}>
            Join Room
          </button>
        </div>
      </div>
    </div>
  )
}
function JoinPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [roomExists, setRoomExists] = useState(true)
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`)
    return onValue(roomRef, (snap) => {
      setRoomExists(snap.exists())
    })
  }, [roomId])
  const joinRoom = async () => {
    const cleanName = name.trim()
    if (!cleanName) return
    const playerRef = push(ref(db, `rooms/${roomId}/players`))
    await set(playerRef, {
      id: playerRef.key,
      name: cleanName,
      isImpostor: false,
      assignedWord: '',
      joinedAt: Date.now(),
    })
    localStorage.setItem('tebak_player_id', playerRef.key)
    localStorage.setItem('tebak_player_name', cleanName)
    navigate(`/player/${roomId}/${playerRef.key}`)
  }
  if (!roomExists) {
    return (
      <div className="page center-page">
        <div className="card small-card">
          <h2>Room tidak ditemukan</h2>
          <Link to="/" className="btn btn-secondary full-btn">Kembali</Link>
        </div>
      </div>
    )
  }
  return (
    <div className="page center-page">
      <div className="card small-card">
        <h2>Join Room {roomId}</h2>
        <p className="subtitle">Masukkan nama kamu dulu.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Azka"
        />
        <button className="btn btn-primary full-btn" onClick={joinRoom}>
          Join
        </button>
      </div>
    </div>
  )
}
function HostPage() {
  const { roomId } = useParams()
  const [room, setRoom] = useState(null)
  const [normalWord, setNormalWord] = useState('Kucing')
  const [impostorWord, setImpostorWord] = useState('Harimau')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`)
    return onValue(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val()
        setRoom(data)
        if (data.settings?.normalWord)
          setNormalWord(data.settings.normalWord)
        if (data.settings?.impostorWord)
          setImpostorWord(data.settings.impostorWord)
      } else {
        setRoom(null)
      }
    })
  }, [roomId])
  const players = useMemo(() => {
    return room?.players ? Object.values(room.players) : []
  }, [room])
  const shareLink = `${window.location.origin}/join/${roomId}`
  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const startGame = async () => {
    if (players.length < 2) {
      alert('Minimal 2 pemain dulu.')
      return
    }
    if (!normalWord.trim() || !impostorWord.trim()) {
      alert('Isi kata normal dan kata impostor dulu.')
      return
    }
    const impostorIndex = Math.floor(Math.random() * players.length)
    const updates = {}
    players.forEach((player, index) => {
      updates[`rooms/${roomId}/players/${player.id}/isImpostor`] = index ===
        impostorIndex
      updates[`rooms/${roomId}/players/${player.id}/assignedWord`] =
        index === impostorIndex ? impostorWord.trim() : normalWord.trim()
    })
    updates[`rooms/${roomId}/settings/normalWord`] = normalWord.trim()
    updates[`rooms/${roomId}/settings/impostorWord`] = impostorWord.trim()
    updates[`rooms/${roomId}/phase`] = 'playing'
    updates[`rooms/${roomId}/votes`] = {}
    updates[`rooms/${roomId}/result`] = null
    await update(ref(db), updates)
  }
  const goVoting = async () => {
    await update(ref(db, `rooms/${roomId}`), {
      phase: 'voting',
      votes: {},
      result: null,
    })
  }
  const showResult = async () => {
    const votesSnap = await get(ref(db, `rooms/${roomId}/votes`))
    const votes = votesSnap.exists() ? Object.values(votesSnap.val()) : []
    const countMap = {}
    votes.forEach((vote) => {
      countMap[vote.targetId] = (countMap[vote.targetId] || 0) + 1
    })
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1])
    const topTargetId = sorted[0]?.[0] || null
    const topVotes = sorted[0]?.[1] || 0
    const votedPlayer = players.find((p) => p.id === topTargetId) || null
    const impostorPlayer = players.find((p) => p.isImpostor) || null
    await update(ref(db, `rooms/${roomId}`), {
      phase: 'result',
      result: {
        countMap,
        topTargetId,
        topVotes,
        votedPlayerName: votedPlayer?.name || '-',
        impostorId: impostorPlayer?.id || null,
        impostorName: impostorPlayer?.name || '-',
        isCorrect: votedPlayer?.id === impostorPlayer?.id,
        shownAt: Date.now(),
      },
    })
  }
  const resetGame = async () => {
    const updates = {
      [`rooms/${roomId}/phase`]: 'lobby',
      [`rooms/${roomId}/votes`]: {},
      [`rooms/${roomId}/result`]: null,
    }
    players.forEach((player) => {
      updates[`rooms/${roomId}/players/${player.id}/isImpostor`] = false
      updates[`rooms/${roomId}/players/${player.id}/assignedWord`] = ''
    })
    await update(ref(db), updates)
  }
  const deleteRoom = async () => {
    const ok = window.confirm('Yakin ingin menghapus room ini?')
    if (!ok) return
    await remove(ref(db, `rooms/${roomId}`))
    window.location.href = '/'
  }
  if (!room) {
    return (
      <div className="page center-page">
        <div className="card small-card">
          <h2>Room tidak ada</h2>
          <Link to="/" className="btn btn-secondary full-btn">Kembali</Link>
        </div>
      </div>
    )
  }

  const voteCount = room.votes ? Object.keys(room.votes).length : 0
  return (
    <div className="page">
      <div className="container two-col">
        <div className="card">
          <div className="row-between gap-wrap">
            <div>
              <span className="badge">Host Panel</span>
              <h2>Room {roomId}</h2>
              <p className="subtitle">Bagikan link ini ke pemain.</p>
            </div>
            <button className="btn btn-secondary" onClick={copyLink}>
              {copied ? 'Link tersalin' : 'Salin Link'}
            </button>
          </div>
          <div className="share-link">{shareLink}</div>
          <div className="form-grid">
            <div>
              <label>Kata normal</label>
              <input value={normalWord} onChange={(e) =>
                setNormalWord(e.target.value)} />
            </div>
            <div>
              <label>Kata impostor</label>
              <input value={impostorWord} onChange={(e) =>
                setImpostorWord(e.target.value)} />
            </div>
          </div>
          <div className="action-group">
            <button className="btn btn-primary" onClick={startGame}>Mulai
              Game</button>
            <button className="btn btn-warning" onClick={goVoting}>Pindah ke
              Voting</button>
            <button className="btn btn-success" onClick={showResult}
            >Tampilkan Hasil</button>
            <button className="btn btn-secondary" onClick={resetGame}>Main
              Lagi</button>
            <button className="btn btn-danger" onClick={deleteRoom}>Hapus
              Room</button>
          </div>
          <div className="status-box">
            <strong>Fase:</strong> {room.phase}
            <br />
            <strong>Jumlah vote masuk:</strong> {voteCount}
          </div>
        </div>
        <div className="card">
          <h3>Daftar Peserta ({players.length})</h3>
          {players.length === 0 ? (
            <p className="subtitle">Belum ada pemain yang join.</p>
          ) : (
            <div className="player-list">
              {players.map((player) => (
                <div className="player-item" key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <div className="muted">ID: {player.id}</div>
                  </div>
                  <div className="pill">
                    {room.phase === 'result'
                      ? player.isImpostor
                        ? 'Impostor'
                        : 'Normal'
                      : 'Pemain'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {room.phase === 'result' && room.result && (
            <div className="result-card">
              <h3>Hasil Voting</h3>
              <p><strong>Peserta terpilih:</strong>
                {room.result.votedPlayerName}</p>
              <p><strong>Impostor asli:</strong> {room.result.impostorName}</p>
              <p>
                <strong>Status:</strong>{' '}
                {room.result.isCorrect ? 'Benar, impostor ketebak.' :
                  'Salah, impostor lolos.'}
              </p>
              <div className="vote-map">
                {players.map((player) => (
                  <div className="vote-item" key={player.id}>
                    <span>{player.name}</span>
                    <strong>{room.result.countMap?.[player.id] || 0} vote</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayerPage() {
  const { roomId, playerId } = useParams()
  const [room, setRoom] = useState(null)
  const [player, setPlayer] = useState(null)
  const [selectedVote, setSelectedVote] = useState('')
  const [voteSent, setVoteSent] = useState(false)
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`)
    return onValue(roomRef, (snap) => {
      if (!snap.exists()) {
        setRoom(null)
        setPlayer(null)
        return
      }
      const data = snap.val()
      setRoom(data)
      const me = data.players?.[playerId] || null
      setPlayer(me)
      if (data.votes && data.votes[playerId]) {
        setVoteSent(true)
        setSelectedVote(data.votes[playerId].targetId)
      } else {
        setVoteSent(false)
      }
    })
  }, [roomId, playerId])
  if (!room || !player) {
    return (
      <div className="page center-page">
        <div className="card small-card">
          <h2>Data pemain tidak ditemukan</h2>
          <Link to="/" className="btn btn-secondary full-btn">Kembali</Link>
        </div>
      </div>
    )
  }
  const players = room.players ? Object.values(room.players) : []
  const votingTargets = players.filter((p) => p.id !== playerId)
  const submitVote = async () => {
    if (!selectedVote) return
    await set(ref(db, `rooms/${roomId}/votes/${playerId}`), {
      voterId: playerId,
      voterName: player.name,
      targetId: selectedVote,
      createdAt: Date.now(),
    })
  }
  return (
    <div className="page center-page">
      <div className="card player-card">
        <span className="badge">Halo, {player.name}</span>
        <h2>Tebak Impostor</h2>
        {room.phase === 'lobby' && (
          <div>
            <p className="subtitle">Tunggu host memulai game.</p>
          </div>
        )}
        {room.phase === 'playing' && (
          <div>
            <p className="subtitle">Kata kamu adalah:</p>
            <div className="secret-word">{player.assignedWord || 'Menunggu kata...'}</div>
            <p className="helper-text">
              Jelaskan kata ini secara lisan saat bermain offline. Jangan tunjukkan layar ke pemain lain.
            </p>
          </div>
        )}
        {room.phase === 'voting' && (
          <div>
            <p className="subtitle">Pilih siapa yang menurutmu impostor.</p>
            <div className="vote-list">
              {votingTargets.map((target) => (
                <label className="vote-option" key={target.id}>
                  <input
                    type="radio"
                    name="vote"
                    value={target.id}
                    checked={selectedVote === target.id}
                    onChange={(e) => setSelectedVote(e.target.value)}
                    disabled={voteSent}
                  />
                  <span>{target.name}</span>
                </label>
              ))}
            </div>
            <button
              className="btn btn-primary full-btn"
              onClick={submitVote}
              disabled={voteSent || !selectedVote}
            >
              {voteSent ? 'Vote sudah dikirim' : 'Kirim Vote'}
            </button>
          </div>
        )}
        {room.phase === 'result' && room.result && (
          <div>
            <h3>Hasil</h3>
            <div className="result-player-box">
              <p><strong>Impostor asli:</strong> {room.result.impostorName}</p>
              <p><strong>Yang paling banyak dipilih:</strong>
                {room.result.votedPlayerName}</p>
              <p>
                <strong>Kesimpulan:</strong>{' '}
                {room.result.isCorrect ? 'Impostor berhasil ditemukan.' :
                  'Impostor berhasil lolos.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join/:roomId" element={<JoinPage />} />
      <Route path="/host/:roomId" element={<HostPage />} />
      <Route path="/player/:roomId/:playerId" element={<PlayerPage />} />
    </Routes>
  )
}