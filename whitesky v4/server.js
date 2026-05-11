import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = 3001
const dbPath = path.join(__dirname, 'data', 'database.json')
const sessions = new Map()

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

async function readDb() {
  const text = await fs.readFile(dbPath, 'utf-8')
  return JSON.parse(text)
}

async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2))
}

function getToken(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

function auth(req, res, next) {
  const token = getToken(req)
  const user = sessions.get(token)
  if (!user) return res.status(401).json({ message: 'Nu ești logat.' })
  req.user = user
  next()
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Acces permis doar pentru admin.' })
  next()
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}


app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Completează numele, emailul și parola.' })
  }

  if (password.length < 4) {
    return res.status(400).json({ message: 'Parola trebuie să aibă minimum 4 caractere.' })
  }

  const db = await readDb()
  const exists = db.users.some(user => user.email.toLowerCase() === email)
  if (exists) return res.status(409).json({ message: 'Există deja un cont cu acest email.' })

  const user = {
    id: db.users.length ? Math.max(...db.users.map(item => Number(item.id) || 0)) + 1 : 1,
    name,
    email,
    password,
    role: 'user',
    favorites: []
  }

  db.users.push(user)
  await writeDb(db)

  const token = crypto.randomBytes(32).toString('hex')
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role }
  sessions.set(token, safeUser)

  res.status(201).json({ token, user: safeUser, message: 'Contul a fost creat cu succes.' })
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const db = await readDb()
  const user = db.users.find(item => String(item.email).toLowerCase() === email && item.password === password)
  if (!user) return res.status(401).json({ message: 'Email sau parolă greșită.' })
  const token = crypto.randomBytes(32).toString('hex')
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role }
  sessions.set(token, safeUser)
  res.json({ token, user: safeUser })
})

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/logout', auth, (req, res) => {
  sessions.delete(getToken(req))
  res.json({ message: 'Ai ieșit din cont.' })
})


app.get('/api/favorites', auth, async (req, res) => {
  const db = await readDb()
  const user = db.users.find(item => Number(item.id) === Number(req.user.id))
  if (!user) return res.status(404).json({ message: 'Utilizatorul nu a fost găsit.' })
  user.favorites ||= []
  res.json({ favorites: user.favorites })
})

app.post('/api/favorites', auth, async (req, res) => {
  const resortId = String(req.body.resortId || '').trim()
  if (!resortId) return res.status(400).json({ message: 'Lipsește stațiunea.' })

  const db = await readDb()
  const user = db.users.find(item => Number(item.id) === Number(req.user.id))
  if (!user) return res.status(404).json({ message: 'Utilizatorul nu a fost găsit.' })
  const existsResort = db.resorts.some(item => item.id === resortId)
  if (!existsResort) return res.status(404).json({ message: 'Stațiunea nu există.' })

  user.favorites ||= []
  if (!user.favorites.includes(resortId)) user.favorites.push(resortId)
  await writeDb(db)
  res.json({ favorites: user.favorites, message: 'Adăugat la favorite.' })
})

app.delete('/api/favorites/:id', auth, async (req, res) => {
  const db = await readDb()
  const user = db.users.find(item => Number(item.id) === Number(req.user.id))
  if (!user) return res.status(404).json({ message: 'Utilizatorul nu a fost găsit.' })
  user.favorites ||= []
  user.favorites = user.favorites.filter(item => item !== req.params.id)
  await writeDb(db)
  res.json({ favorites: user.favorites, message: 'Șters din favorite.' })
})


app.get('/api/resorts', async (req, res) => {
  const db = await readDb()
  res.json(db.resorts)
})

app.post('/api/resorts', auth, adminOnly, async (req, res) => {
  const db = await readDb()
  const item = {
    id: slug(req.body.name) || crypto.randomUUID(),
    name: req.body.name,
    country: req.body.country,
    difficulty: req.body.difficulty,
    altitude: req.body.altitude,
    slopes: req.body.slopes,
    rating: Number(req.body.rating || 0),
    price: req.body.price || '$$',
    image: req.body.image || 'assets/img/resort-1.jpg',
    description: req.body.description || ''
  }
  if (!item.name || !item.country) return res.status(400).json({ message: 'Completează numele și țara.' })
  db.resorts.push(item)
  await writeDb(db)
  res.status(201).json(item)
})

app.put('/api/resorts/:id', auth, adminOnly, async (req, res) => {
  const db = await readDb()
  const index = db.resorts.findIndex(item => item.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Stațiunea nu a fost găsită.' })
  db.resorts[index] = { ...db.resorts[index], ...req.body, rating: Number(req.body.rating || db.resorts[index].rating) }
  await writeDb(db)
  res.json(db.resorts[index])
})

app.delete('/api/resorts/:id', auth, adminOnly, async (req, res) => {
  const db = await readDb()
  db.resorts = db.resorts.filter(item => item.id !== req.params.id)
  await writeDb(db)
  res.json({ message: 'Stațiunea a fost ștearsă.' })
})

app.post('/api/contact', async (req, res) => {
  const db = await readDb()
  const item = {
    id: crypto.randomUUID(),
    name: req.body.name || 'Vizitator',
    email: req.body.email,
    topic: req.body.topic || 'general',
    message: req.body.message,
    createdAt: new Date().toISOString()
  }
  if (!item.email || !item.message) return res.status(400).json({ message: 'Emailul și mesajul sunt obligatorii.' })
  db.contacts.unshift(item)
  await writeDb(db)
  res.status(201).json({ message: 'Mesajul a fost salvat în backend.' })
})

app.get('/api/contact', auth, adminOnly, async (req, res) => {
  const db = await readDb()
  res.json(db.contacts)
})

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`WhiteSky rulează pe http://localhost:${PORT}`)
})
