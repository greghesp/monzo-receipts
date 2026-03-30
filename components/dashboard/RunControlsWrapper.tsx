'use client'
import { useRouter } from 'next/navigation'
import RunControls from './RunControls'

interface Account { id: string; description: string; type: string }
interface Props { accounts: Account[]; defaultSelected: string[] }

export default function RunControlsWrapper({ accounts, defaultSelected }: Props) {
  const router = useRouter()
  return <RunControls accounts={accounts} defaultSelected={defaultSelected} onRunComplete={() => router.refresh()} />
}
