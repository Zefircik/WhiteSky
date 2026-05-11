const API_URL = ''
const tokenKey = 'whitesky_token'
const userKey = 'whitesky_user'
const localFavoritesKey = 'whitesky_favorites_guest'
let favoritesCache = []

function getToken() {
  return localStorage.getItem(tokenKey)
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(userKey))
  } catch {
    return null
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'A apărut o eroare.')
  return data
}

function show(el, message, type = '') {
  if (!el) return
  el.textContent = message
  el.className = type ? `alert ${type}` : 'form__status'
  el.classList.remove('hidden')
}

function updateYear() {
  document.querySelectorAll('#year').forEach(year => {
    year.textContent = new Date().getFullYear()
  })
}

function logoutLocal() {
  localStorage.removeItem(tokenKey)
  localStorage.removeItem(userKey)
  favoritesCache = []
}

function updateNav() {
  const user = getUser()
  document.querySelectorAll('[data-auth-link]').forEach(link => {
    link.textContent = user ? 'Ieșire' : 'Logare'
    link.href = user ? '#' : 'login.html'

    if (user && !link.dataset.boundLogout) {
      link.dataset.boundLogout = '1'
      link.addEventListener('click', async event => {
        event.preventDefault()
        try {
          await api('/api/auth/logout', { method: 'POST' })
        } catch {}

        logoutLocal()
        location.href = 'index.html'
      })
    }
  })

  document.querySelectorAll('[data-admin-link]').forEach(link => {
    link.classList.toggle('hidden', user?.role !== 'admin')
  })

  document.querySelectorAll('a[href="signup.html"]').forEach(link => {
    link.classList.toggle('hidden', Boolean(user))
  })
}

function getLocalFavorites() {
  try {
    return JSON.parse(localStorage.getItem(localFavoritesKey)) || []
  } catch {
    return []
  }
}

function setLocalFavorites(items) {
  localStorage.setItem(localFavoritesKey, JSON.stringify(items))
}

async function loadFavorites() {
  if (getUser() && getToken()) {
    try {
      const data = await api('/api/favorites')
      favoritesCache = data.favorites || []
      updateFavoritesCount()
      return favoritesCache
    } catch {
      logoutLocal()
    }
  }

  favoritesCache = getLocalFavorites()
  updateFavoritesCount()
  return favoritesCache
}

function getFavorites() {
  return favoritesCache
}

async function toggleFavorite(id) {
  const user = getUser()
  const exists = favoritesCache.includes(id)

  if (user && getToken()) {
    const data = exists
      ? await api(`/api/favorites/${id}`, { method: 'DELETE' })
      : await api('/api/favorites', {
          method: 'POST',
          body: JSON.stringify({ resortId: id })
        })

    favoritesCache = data.favorites || []
  } else {
    favoritesCache = exists
      ? favoritesCache.filter(item => item !== id)
      : [...favoritesCache, id]

    setLocalFavorites(favoritesCache)
  }

  updateFavoritesCount()
  refreshFavoriteButtons()
}

function updateFavoritesCount() {
  document.querySelectorAll('[data-favorites-count]').forEach(el => {
    el.textContent = favoritesCache.length
  })
}

function refreshFavoriteButtons() {
  document.querySelectorAll('[data-fav-btn]').forEach(btn => {
    const exists = favoritesCache.includes(btn.dataset.favBtn)
    btn.textContent = exists ? '★ În favorite' : '☆ Favorite'
  })
}

function renderResortCard(item) {
  const fav = getFavorites().includes(item.id)

  const cls =
    item.difficulty === 'Advanced'
      ? 'badge--hard'
      : item.difficulty === 'Beginner'
        ? 'badge--easy'
        : 'badge--mid'

  return `
    <article class="card resort-card" data-resort-id="${item.id}">
      <img class="card__img" src="${item.image}" alt="${item.name}" width="800" height="500" loading="lazy" />

      <div class="card__body">
        <div class="card__top">
          <h2 class="card__title">${item.name}</h2>
          <span class="badge ${cls}">${item.difficulty}</span>
        </div>

        <p class="muted small">${item.country} • ${item.altitude} • ${item.slopes}</p>
        <p class="small">Rating: <strong>${item.rating}</strong> / 5 • Nivel preț: <strong>${item.price}</strong></p>

        <div class="card__actions">
          <a class="btn btn--primary btn--sm" href="resort.html?id=${item.id}">Vezi detalii</a>
          <button class="btn btn--ghost btn--sm" type="button" data-fav-btn="${item.id}">
            ${fav ? '★ În favorite' : '☆ Favorite'}
          </button>
        </div>
      </div>
    </article>`
}

async function initResortsPage() {
  const grid = document.querySelector('#resorts-grid')
  if (!grid) return

  const q = document.querySelector('#q')
  const country = document.querySelector('#country')
  const difficulty = document.querySelector('#difficulty')
  const sort = document.querySelector('#sort')

  let resorts = await api('/api/resorts')

  function render() {
    let list = [...resorts]
    const text = (q?.value || '').toLowerCase().trim()

    if (text) {
      list = list.filter(item =>
        `${item.name} ${item.country}`.toLowerCase().includes(text)
      )
    }

    if (country?.value) {
      list = list.filter(item =>
        item.country === country.value ||
        item.country.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === country.value
      )
    }

    if (difficulty?.value) {
      list = list.filter(item => item.difficulty === difficulty.value)
    }

    if (sort?.value === 'az') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }

    if (sort?.value === 'rating') {
      list.sort((a, b) => b.rating - a.rating)
    }

    grid.innerHTML = list.map(renderResortCard).join('') || '<p class="muted">Nu s-au găsit stațiuni.</p>'
  }

  ;[q, country, difficulty, sort].forEach(el => {
    el?.addEventListener('input', render)
  })

  render()
}

async function initResortDetail() {
  const box = document.querySelector('#resort-detail')
  if (!box) return

  const id = new URLSearchParams(location.search).get('id')
  const resorts = await api('/api/resorts')
  const item = resorts.find(resort => resort.id === id)

  if (!item) return

  const fav = getFavorites().includes(item.id)

  box.innerHTML = `
    <img class="card__img" src="${item.image}" alt="${item.name}">

    <div class="card__body">
      <h2 class="card__title">${item.name}</h2>
      <p class="muted">${item.country} • ${item.altitude} • ${item.slopes}</p>
      <p>${item.description}</p>

      <p class="small">
        Dificultate: <strong>${item.difficulty}</strong> •
        Rating: <strong>${item.rating}</strong> / 5 •
        Preț: <strong>${item.price}</strong>
      </p>

      <div class="card__actions">
        <a class="btn btn--primary" href="resorts.html">Înapoi la catalog</a>
        <button class="btn btn--ghost" type="button" data-fav-btn="${item.id}">
          ${fav ? '★ În favorite' : '☆ Favorite'}
        </button>
      </div>
    </div>`
}

function initFavoriteButtons() {
  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-fav-btn]')
    if (!btn) return

    try {
      await toggleFavorite(btn.dataset.favBtn)

      if (location.pathname.endsWith('favorites.html')) {
        await initFavoritesPage(true)
      }
    } catch (error) {
      alert(error.message)
    }
  })
}

async function initFavoritesPage(force = false) {
  const grid = document.querySelector('#favorites-grid')
  if (!grid) return

  const resorts = await api('/api/resorts')
  const ids = getFavorites()
  const list = resorts.filter(item => ids.includes(item.id))

  grid.innerHTML = list.map(renderResortCard).join('') || '<p class="muted">Nu ai favorite încă.</p>'
}

function initLogin() {
  const form = document.querySelector('#login-form')
  if (!form) return

  form.addEventListener('submit', async event => {
    event.preventDefault()

    const status = document.querySelector('#login-status')
    const body = Object.fromEntries(new FormData(form).entries())

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body)
      })

      localStorage.setItem(tokenKey, data.token)
      localStorage.setItem(userKey, JSON.stringify(data.user))

      await loadFavorites()

      location.href = data.user.role === 'admin' ? 'admin.html' : 'index.html'
    } catch (error) {
      show(status, error.message, 'alert--error')
    }
  })
}

function initSignup() {
  const form = document.querySelector('#signup-form')
  if (!form) return

  form.addEventListener('submit', async event => {
    event.preventDefault()

    const status = document.querySelector('#signup-status')
    const body = Object.fromEntries(new FormData(form).entries())

    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body)
      })

      localStorage.setItem(tokenKey, data.token)
      localStorage.setItem(userKey, JSON.stringify(data.user))

      await loadFavorites()

      show(status, data.message, 'alert--success')

      setTimeout(() => {
        location.href = 'index.html'
      }, 700)
    } catch (error) {
      show(status, error.message, 'alert--error')
    }
  })
}

function initContact() {
  const form = document.querySelector('#contact-form')
  if (!form) return

  form.addEventListener('submit', async event => {
    event.preventDefault()

    const status = document.querySelector('#form-status')
    const body = Object.fromEntries(new FormData(form).entries())

    try {
      const data = await api('/api/contact', {
        method: 'POST',
        body: JSON.stringify(body)
      })

      show(status, data.message)
      form.reset()
    } catch (error) {
      show(status, error.message, 'alert--error')
    }
  })
}

function initGearChecklist() {
  const checks = document.querySelectorAll('.todo input[type="checkbox"]')
  if (!checks.length) return

  const user = getUser()

  const key = user
    ? `gear_checklist_${user.email}`
    : 'gear_checklist_guest'

  let saved = []

  try {
    saved = JSON.parse(localStorage.getItem(key)) || []
  } catch {
    saved = []
  }

  checks.forEach(check => {
    check.checked = saved.includes(check.value)

    check.addEventListener('change', () => {
      const updated = [...checks]
        .filter(item => item.checked)
        .map(item => item.value)

      localStorage.setItem(key, JSON.stringify(updated))
    })
  })
}

async function initAdmin() {
  const table = document.querySelector('#admin-resorts-table')
  if (!table) return

  const user = getUser()
  const alertBox = document.querySelector('#admin-alert')

  if (!user || user.role !== 'admin') {
    location.href = 'login.html'
    return
  }

  async function load() {
    const resorts = await api('/api/resorts')
    const contacts = await api('/api/contact')

    document.querySelector('#stat-resorts').textContent = resorts.length
    document.querySelector('#stat-contacts').textContent = contacts.length

    table.innerHTML = resorts.map(item => `
      <tr>
        <td><strong>${item.name}</strong></td>
        <td>${item.country}</td>
        <td>${item.difficulty}</td>
        <td>${item.rating}</td>
        <td>
          <button class="btn btn--danger btn--sm" data-delete-resort="${item.id}" type="button">
            Șterge
          </button>
        </td>
      </tr>`).join('')

    document.querySelector('#contacts-list').innerHTML = contacts.map(item => `
      <div class="card" style="box-shadow:none;margin-bottom:10px">
        <div class="card__body">
          <strong>${item.name}</strong><br>
          <span class="muted small">${item.email} • ${item.topic}</span>
          <p class="small">${item.message}</p>
        </div>
      </div>`).join('') || '<p class="muted">Nu sunt mesaje.</p>'
  }

  document.querySelector('#resort-form').addEventListener('submit', async event => {
    event.preventDefault()

    const body = Object.fromEntries(new FormData(event.target).entries())

    try {
      await api('/api/resorts', {
        method: 'POST',
        body: JSON.stringify(body)
      })

      event.target.reset()
      show(alertBox, 'Stațiunea a fost adăugată.', 'alert--success')

      await load()
    } catch (error) {
      show(alertBox, error.message, 'alert--error')
    }
  })

  document.addEventListener('click', async event => {
    const btn = event.target.closest('[data-delete-resort]')
    if (!btn) return

    try {
      await api(`/api/resorts/${btn.dataset.deleteResort}`, {
        method: 'DELETE'
      })

      show(alertBox, 'Stațiunea a fost ștearsă.', 'alert--success')

      await load()
    } catch (error) {
      show(alertBox, error.message, 'alert--error')
    }
  })

  document.querySelector('#logout-btn')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {}

    logoutLocal()
    location.href = 'index.html'
  })

  await load()
}

async function start() {
  updateYear()
  updateNav()
  await loadFavorites()
  initFavoriteButtons()
  initLogin()
  initSignup()
  initContact()
  await initResortsPage()
  await initResortDetail()
  await initFavoritesPage()
  initGearChecklist()
  await initAdmin()
  refreshFavoriteButtons()
}

start()