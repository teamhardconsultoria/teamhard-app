/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

precacheAndRoute((self as any).__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  ({ url }) => url.hostname === 'lgeifkxvrszoynbhckkg.supabase.co',
  new NetworkFirst({ cacheName: 'supabase-cache', networkTimeoutSeconds: 10 })
)

let restTimerId: ReturnType<typeof setTimeout> | null = null

self.addEventListener('message', (event) => {
  if (!event.data) return

  if (event.data.type === 'START_REST_TIMER') {
    if (restTimerId !== null) clearTimeout(restTimerId)
    const ms: number = event.data.ms
    const exerciseName: string = event.data.exerciseName ?? ''
    restTimerId = setTimeout(() => {
      restTimerId = null
      self.registration.showNotification('Descanso finalizado! 💪', {
        body: exerciseName ? `Próxima série: ${exerciseName}` : 'Hora da próxima série!',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: true,
        tag: 'rest-timer',
        renotify: true,
      } as NotificationOptions)
    }, ms)
  }

  if (event.data.type === 'CANCEL_REST_TIMER') {
    if (restTimerId !== null) {
      clearTimeout(restTimerId)
      restTimerId = null
    }
  }
})

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string } = {}
  try { data = event.data?.json() ?? {} } catch { /* empty push */ }
  const title = data.title ?? 'Descanso finalizado! 💪'
  const body  = data.body  ?? 'Hora da próxima série!'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: 'rest-timer',
      renotify: true,
    } as NotificationOptions)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return (client as WindowClient).focus()
      }
      return self.clients.openWindow('/')
    })
  )
})
