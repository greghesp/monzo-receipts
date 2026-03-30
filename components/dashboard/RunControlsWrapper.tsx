import RunControls from './RunControls'

interface Account { id: string; description: string; displayName?: string; type: string }
interface Props {
  accounts: Account[]
  defaultSelected: string[]
  defaultLookbackDays: number
  defaultOnlyOnline: boolean
}

export default function RunControlsWrapper({ accounts, defaultSelected, defaultLookbackDays, defaultOnlyOnline }: Props) {
  return <RunControls accounts={accounts} defaultSelected={defaultSelected} defaultLookbackDays={defaultLookbackDays} defaultOnlyOnline={defaultOnlyOnline} />
}
