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

const AVATARS = ['🐯', '🐼', '🦊', '🐸', '🐵', '🐨', '🐻', '🐰', '🐶', '🐹', '🦁', '🐙']

function randomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function getAvatar(index = 0) {
  return AVATARS[index % AVATARS.length]
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
      round: 1,
      maxRounds: 3,
      settings: {
        normalWord: '',
        impostorWord: '',
        selectedImpostorId: '',
      },
      players: {},
      votes: {},
      clues: {
        1: {},
        2: {},
        3: {},
      },
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
        <span className="badge">Party Game</span>
        <h1>Tebak Impostor</h1>
        <p className="subtitle">
          Main bareng dari HP, kasih clue 3 ronde, lalu voting siapa impostornya.
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

    const roomPlayersSnap = await get(ref(db, `rooms/${roomId}/players`))
    const playerCount = roomPlayersSnap.exists()
      ? Object.keys(roomPlayersSnap.val()).length
      : 0

    const playerRef = push(ref(db, `rooms/${roomId}/players`))
    await set(playerRef, {
      id: playerRef.key,
      name: cleanName,
      avatar: getAvatar(playerCount),
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
  const [selectedImpostorId, setSelectedImpostorId] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`)
    return onValue(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val()
        setRoom(data)
        if (data.settings?.normalWord) setNormalWord(data.settings.normalWord)
        if (data.settings?.impostorWord) setImpostorWord(data.settings.impostorWord)
        if (data.settings?.selectedImpostorId) setSelectedImpostorId(data.settings.selectedImpostorId)
      } else {
        setRoom(null)
      }
    })
  }, [roomId])

  const players = useMemo(() => {
    return room?.players ? Object.values(room.players) : []
  }, [room])

  const round = room?.round || 1
  const maxRounds = room?.maxRounds || 3
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

    if (!selectedImpostorId) {
      alert('Pilih dulu siapa yang jadi impostor.')
      return
    }

    const updates = {}

    players.forEach((player) => {
      const isImpostor = player.id === selectedImpostorId
      updates[`rooms/${roomId}/players/${player.id}/isImpostor`] = isImpostor
      updates[`rooms/${roomId}/players/${player.id}/assignedWord`] = isImpostor
        ? impostorWord.trim()
        : normalWord.trim()
    })

    updates[`rooms/${roomId}/settings/normalWord`] = normalWord.trim()
    updates[`rooms/${roomId}/settings/impostorWord`] = impostorWord.trim()
    updates[`rooms/${roomId}/settings/selectedImpostorId`] = selectedImpostorId
    updates[`rooms/${roomId}/phase`] = 'playing'
    updates[`rooms/${roomId}/round`] = 1
    updates[`rooms/${roomId}/votes`] = {}
    updates[`rooms/${roomId}/result`] = null
    updates[`rooms/${roomId}/clues`] = {
      1: {},
      2: {},
      3: {},
    }

    await update(ref(db), updates)
  }

  const nextRound = async () => {
    if (round < maxRounds) {
      await update(ref(db, `rooms/${roomId}`), {
        round: round + 1,
      })
    } else {
      await update(ref(db, `rooms/${roomId}`), {
        phase: 'recap',
      })
    }
  }

  const goRecap = async () => {
    await update(ref(db, `rooms/${roomId}`), {
      phase: 'recap',
    })
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
      [`rooms/${roomId}/round`]: 1,
      [`rooms/${roomId}/votes`]: {},
      [`rooms/${roomId}/result`]: null,
      [`rooms/${roomId}/clues`]: {
        1: {},
        2: {},
        3: {},
      },
      [`rooms/${roomId}/settings/selectedImpostorId`]: '',
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

  const getClueCountForRound = (roundNumber) => {
    return room?.clues?.[roundNumber]
      ? Object.keys(room.clues[roundNumber]).length
      : 0
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
              <input value={normalWord} onChange={(e) => setNormalWord(e.target.value)} />
            </div>
            <div>
              <label>Kata impostor</label>
              <input value={impostorWord} onChange={(e) => setImpostorWord(e.target.value)} />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Pilih impostor</label>
              <select
                className="select-box"
                value={selectedImpostorId}
                onChange={(e) => setSelectedImpostorId(e.target.value)}
              >
                <option value="">-- Pilih pemain --</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.avatar} {player.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Status game</label>
              <div className="status-box">
                <strong>Fase:</strong> {room.phase}
                <br />
                <strong>Round:</strong> {round}/{maxRounds}
                <br />
                <strong>Vote masuk:</strong> {voteCount}
              </div>
            </div>
          </div>

          <div className="action-group">
            <button className="btn btn-primary" onClick={startGame}>Mulai Game</button>
            <button className="btn btn-warning" onClick={nextRound}>Next Round</button>
            <button className="btn btn-secondary" onClick={goRecap}>Lihat Rekap</button>
            <button className="btn btn-warning" onClick={goVoting}>Pindah ke Voting</button>
            <button className="btn btn-success" onClick={showResult}>Tampilkan Hasil</button>
            <button className="btn btn-secondary" onClick={resetGame}>Main Lagi</button>
            <button className="btn btn-danger" onClick={deleteRoom}>Hapus Room</button>
          </div>

          <div className="round-summary">
            <div className="mini-round-card">Ronde 1: {getClueCountForRound(1)} input</div>
            <div className="mini-round-card">Ronde 2: {getClueCountForRound(2)} input</div>
            <div className="mini-round-card">Ronde 3: {getClueCountForRound(3)} input</div>
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
                  <div className="player-profile">
                    <div className="avatar-circle">{player.avatar || '🙂'}</div>
                    <div>
                      <strong>{player.name}</strong>
                      <div className="muted">
                        {room.phase === 'result'
                          ? player.isImpostor
                            ? 'Impostor'
                            : 'Bukan impostor'
                          : 'Pemain'}
                      </div>
                    </div>
                  </div>

                  <div className="pill">
                    {selectedImpostorId === player.id ? 'Terpilih' : 'Peserta'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(room.phase === 'recap' || room.phase === 'voting' || room.phase === 'result') && (
            <div className="result-card">
              <h3>Rekapan Clue</h3>

              {[1, 2, 3].map((roundNumber) => (
                <div className="recap-round" key={roundNumber}>
                  <h4>Ronde {roundNumber}</h4>
                  <div className="vote-map">
                    {players.map((player) => {
                      const clue = room?.clues?.[roundNumber]?.[player.id]?.text || '-'
                      return (
                        <div className="vote-item" key={`${roundNumber}-${player.id}`}>
                          <span>
                            {player.avatar} {player.name}
                          </span>
                          <strong>{clue}</strong>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {room.phase === 'result' && room.result && (
            <div className="result-card">
              <h3>Hasil Voting</h3>
              <p><strong>Peserta terpilih:</strong> {room.result.votedPlayerName}</p>
              <p><strong>Impostor asli:</strong> {room.result.impostorName}</p>
              <p>
                <strong>Status:</strong>{' '}
                {room.result.isCorrect ? 'Benar, impostor ketebak.' : 'Salah, impostor lolos.'}
              </p>

              <div className="vote-map">
                {players.map((player) => (
                  <div className="vote-item" key={player.id}>
                    <span>{player.avatar} {player.name}</span>
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
  const [clueInput, setClueInput] = useState('')

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

      const currentRound = data.round || 1
      const existingClue = data?.clues?.[currentRound]?.[playerId]?.text || ''
      setClueInput(existingClue)
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
  const currentRound = room.round || 1
  const maxRounds = room.maxRounds || 3

  const submitVote = async () => {
    if (!selectedVote) return
    await set(ref(db, `rooms/${roomId}/votes/${playerId}`), {
      voterId: playerId,
      voterName: player.name,
      targetId: selectedVote,
      createdAt: Date.now(),
    })
  }

  const saveClue = async () => {
    const cleanClue = clueInput.trim()
    if (!cleanClue) return

    await set(ref(db, `rooms/${roomId}/clues/${currentRound}/${playerId}`), {
      playerId,
      playerName: player.name,
      text: cleanClue,
      round: currentRound,
      createdAt: Date.now(),
    })
  }

  const getMyClue = (roundNumber) => {
    return room?.clues?.[roundNumber]?.[playerId]?.text || '-'
  }

  return (
    <div className="page center-page">
      <div className="card player-card">
        <div className="player-top-header">
          <div className="avatar-circle large-avatar">{player.avatar || '🙂'}</div>
          <div>
            <span className="badge">Halo, {player.name}</span>
            <h2>Tebak Impostor</h2>
          </div>
        </div>

        {room.phase === 'lobby' && (
          <div>
            <p className="subtitle">Tunggu host memulai game.</p>
          </div>
        )}

        {room.phase === 'playing' && (
          <div>
            <p className="subtitle">Kata kamu adalah:</p>
            <div className="secret-word">{player.assignedWord || 'Menunggu kata...'}</div>

            <div className="round-banner">
              Ronde {currentRound} / {maxRounds}
            </div>

            <p className="helper-text">
              Setelah kamu menyebutkan clue secara lisan, tulis 1 kata clue kamu di bawah ini.
            </p>

            <input
              value={clueInput}
              onChange={(e) => setClueInput(e.target.value)}
              placeholder={`Tulis clue ronde ${currentRound}`}
            />

            <button className="btn btn-primary full-btn mt12" onClick={saveClue}>
              Simpan Clue Ronde {currentRound}
            </button>

            <div className="result-card">
              <h3>Rekap Clue Kamu</h3>
              <div className="vote-map">
                <div className="vote-item">
                  <span>Ronde 1</span>
                  <strong>{getMyClue(1)}</strong>
                </div>
                <div className="vote-item">
                  <span>Ronde 2</span>
                  <strong>{getMyClue(2)}</strong>
                </div>
                <div className="vote-item">
                  <span>Ronde 3</span>
                  <strong>{getMyClue(3)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {room.phase === 'recap' && (
          <div>
            <h3>Rekap Sebelum Voting</h3>
            <p className="subtitle">Ini rekapan clue semua pemain dari ronde 1 sampai 3.</p>

            {[1, 2, 3].map((roundNumber) => (
              <div className="recap-round" key={roundNumber}>
                <h4>Ronde {roundNumber}</h4>
                <div className="vote-map">
                  {players.map((p) => {
                    const clue = room?.clues?.[roundNumber]?.[p.id]?.text || '-'
                    return (
                      <div className="vote-item" key={`${roundNumber}-${p.id}`}>
                        <span>{p.avatar} {p.name}</span>
                        <strong>{clue}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {room.phase === 'voting' && (
          <div>
            <h3>Rekap Sebelum Voting</h3>

            {[1, 2, 3].map((roundNumber) => (
              <div className="recap-round" key={roundNumber}>
                <h4>Ronde {roundNumber}</h4>
                <div className="vote-map">
                  {players.map((p) => {
                    const clue = room?.clues?.[roundNumber]?.[p.id]?.text || '-'
                    return (
                      <div className="vote-item" key={`${roundNumber}-${p.id}`}>
                        <span>{p.avatar} {p.name}</span>
                        <strong>{clue}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

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
                  <span>{target.avatar} {target.name}</span>
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
              <p><strong>Yang paling banyak dipilih:</strong> {room.result.votedPlayerName}</p>
              <p>
                <strong>Kesimpulan:</strong>{' '}
                {room.result.isCorrect ? 'Impostor berhasil ditemukan.' : 'Impostor berhasil lolos.'}
              </p>
            </div>

            <div className="result-card">
              <h3>Rekap Semua Ronde</h3>
              {[1, 2, 3].map((roundNumber) => (
                <div className="recap-round" key={roundNumber}>
                  <h4>Ronde {roundNumber}</h4>
                  <div className="vote-map">
                    {players.map((p) => {
                      const clue = room?.clues?.[roundNumber]?.[p.id]?.text || '-'
                      return (
                        <div className="vote-item" key={`${roundNumber}-${p.id}`}>
                          <span>{p.avatar} {p.name}</span>
                          <strong>{clue}</strong>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
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