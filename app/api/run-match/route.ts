import { NextRequest, NextResponse } from 'next/server'
import { runMatch, type SseEvent } from '@/lib/runner'

let isRunning = false

export async function POST(req: NextRequest) {
  if (isRunning) {
    return NextResponse.json({ error: 'A run is already in progress' }, { status: 409 })
  }

  const { accountIds } = await req.json() as { accountIds: string[] }
  if (!accountIds?.length) {
    return NextResponse.json({ error: 'accountIds required' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  isRunning = true

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await runMatch(accountIds, emit)
      } finally {
        isRunning = false
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
