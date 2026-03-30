import type { ParsedReceipt } from '../types'

export function extractJsonLdOrder(html: string, emailDate?: string): ParsedReceipt | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      const nodes: any[] = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data]

      for (const node of nodes) {
        if (node['@type'] === 'Order' || node['@type'] === 'Invoice') {
          return parseOrderNode(node, emailDate)
        }
      }
    } catch {
      continue
    }
  }
  return null
}

function priceToPence(price: string | number | undefined): number {
  if (price === undefined) return 0
  return Math.round(parseFloat(String(price)) * 100)
}

function parseOrderNode(node: any, emailDate?: string): ParsedReceipt {
  const total =
    priceToPence(node.price) ||
    priceToPence(node.totalPaymentDue?.price) ||
    priceToPence(node.totalPrice)

  const merchant =
    node.merchant?.name ||
    node.seller?.name ||
    node.vendor?.name ||
    'Unknown'

  const items = (node.orderedItem ?? []).map((item: any) => ({
    description: item.orderedItem?.name ?? item.name ?? 'Item',
    amount: priceToPence(item.orderItemPrice?.price ?? item.price),
    quantity: Number(item.orderQuantity ?? 1),
  }))

  return {
    merchant,
    total,
    currency: node.priceCurrency ?? 'GBP',
    date: node.orderDate ?? emailDate ?? new Date().toISOString(),
    items,
  }
}
