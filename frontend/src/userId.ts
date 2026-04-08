import { v4 as uuidv4 } from 'uuid'

const COOKIE_NAME = 'user_id'
const MAX_AGE = 365 * 24 * 60 * 60 // 365 days in seconds

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge: number) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; SameSite=Strict${secure}`
}

export function getUserId(): string {
  let id = getCookie(COOKIE_NAME)
  if (!id) {
    id = uuidv4()
    setCookie(COOKIE_NAME, id, MAX_AGE)
  }
  return id
}
