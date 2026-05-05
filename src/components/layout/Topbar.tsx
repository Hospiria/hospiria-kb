'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Profile, Notification } from '@/types'
import { Bell, LogOut, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface TopbarProps {
  profile: Profile
  title?: string
}

export function Topbar({ profile, title }: TopbarProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [showUser, setShowUser] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const notifsRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, () => loadNotifications())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) setShowNotifs(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data ?? [])
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-30">
      <div>
        {title && <h1 className="text-base font-semibold text-navy-700">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div ref={notifsRef} className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 text-gray-500 hover:text-navy-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-sm text-navy-700">Notifications</p>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-teal-600 hover:text-teal-700">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No notifications</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markRead(n.id)
                        if (n.link) router.push(n.link)
                        setShowNotifs(false)
                      }}
                      className={cn(
                        'px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0',
                        !n.read && 'bg-teal-50'
                      )}
                    >
                      <p className="text-sm text-gray-800">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(n.created_at)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-navy-700 flex items-center justify-center">
              <span className="text-white text-xs font-semibold">
                {(profile.full_name ?? 'U')[0].toUpperCase()}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              {profile.full_name ?? 'User'}
            </span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showUser && (
            <div className="absolute right-0 top-10 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
