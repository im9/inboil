import { checkBrowserCompat } from './lib/compat'
import './app.css'

const compatError = checkBrowserCompat()
if (compatError) {
  const el = document.getElementById('app')!
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;padding:2rem;text-align:center;font-family:system-ui,sans-serif'
  const inner = document.createElement('div')
  const h1 = document.createElement('h1')
  h1.style.cssText = 'font-size:1.5rem;margin-bottom:1rem'
  h1.textContent = 'inboil requires a modern browser'
  const p1 = document.createElement('p')
  p1.style.cssText = 'color:#9A9680;line-height:1.6'
  p1.textContent = compatError
  const p2 = document.createElement('p')
  p2.style.cssText = 'margin-top:1rem;color:#9A9680'
  p2.textContent = 'Please use Chrome 66+, Firefox 76+, or Safari 14.1+.'
  inner.append(h1, p1, p2)
  wrap.appendChild(inner)
  el.appendChild(wrap)
} else {
  Promise.all([import('svelte'), import('./App.svelte')]).then(([{ mount }, { default: App }]) => {
    mount(App, { target: document.getElementById('app')! })
  })
}
