export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function $(sel, root = document) {
  return root.querySelector(sel)
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)]
}

export function money(n) {
  return `$${(+n || 0).toFixed(2)}`
}

let toastCount = 0
export function showToast(msg, type = 'info') {
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = msg
  const offset = toastCount * 44
  toast.style.bottom = `${70 + offset}px`
  toastCount++
  document.body.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    toastCount = Math.max(0, toastCount - 1)
    setTimeout(() => toast.remove(), 300)
  }, 2500)
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function debounce(fn, ms = 250) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}
