'use client'
import ConnectionBadge from '@/components/ConnectionBadge'

interface Props { monzoConnected: boolean; googleConnected: boolean }

export default function ConnectionBadgesWrapper({ monzoConnected, googleConnected }: Props) {
  return (
    <>
      <ConnectionBadge label="Monzo" connected={monzoConnected} onReconnect={() => { window.location.href = '/api/auth/monzo' }} />
      <ConnectionBadge label="Gmail" connected={googleConnected} onReconnect={() => { window.location.href = '/api/auth/google' }} />
    </>
  )
}
