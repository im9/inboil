import { checkBrowserCompat } from './lib/compat'
import './app.css'

const compatError = checkBrowserCompat()
if (compatError) {
  const el = document.getElementById('app')!
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:2rem;text-align:center;font-family:system-ui,sans-serif">
      <div>
        <h1 style="font-size:1.5rem;margin-bottom:1rem">inboil requires a modern browser</h1>
        <p style="color:#9A9680;line-height:1.6">${compatError}</p>
        <p style="margin-top:1rem;color:#9A9680">Please use Chrome 66+, Firefox 76+, or Safari 14.1+.</p>
      </div>
    </div>`
} else {
  Promise.all([import('svelte'), import('./App.svelte')]).then(([{ mount }, { default: App }]) => {
    mount(App, { target: document.getElementById('app')! })
  })
}
