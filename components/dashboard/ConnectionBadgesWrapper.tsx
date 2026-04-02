'use client'
import ConnectionBadge from '@/components/ConnectionBadge'

interface Props { monzoConnected: boolean; googleAccountCount: number }

export default function ConnectionBadgesWrapper({ monzoConnected, googleAccountCount }: Props) {
  return (
    <>
      <ConnectionBadge label="Monzo" connected={monzoConnected} onReconnect={() => { window.location.href = '/api/auth/monzo' }} />
      <ConnectionBadge
        label={googleAccountCount > 1 ? `Gmail (${googleAccountCount})` : 'Gmail'}
        connected={googleAccountCount > 0}
        onReconnect={() => { window.location.href = '/settings' }}
      />
    </>
  )
}
