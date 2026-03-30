import { extractJsonLdOrder } from '../jsonld'

const makeHtml = (json: object) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head></html>`

describe('extractJsonLdOrder', () => {
  it('returns null when no JSON-LD present', () => {
    expect(extractJsonLdOrder('<html><body>no script</body></html>')).toBeNull()
  })

  it('extracts a top-level Order node', () => {
    const html = makeHtml({
      '@context': 'https://schema.org',
      '@type': 'Order',
      orderNumber: 'ORD-123',
      price: '24.99',
      priceCurrency: 'GBP',
      orderDate: '2026-03-01T10:00:00Z',
      merchant: { name: 'Amazon' },
      orderedItem: [
        { '@type': 'OrderItem', orderQuantity: 1, orderedItem: { name: 'Headphones' }, orderItemPrice: { price: '24.99', priceCurrency: 'GBP' } }
      ],
    })
    const result = extractJsonLdOrder(html)
    expect(result).not.toBeNull()
    expect(result!.merchant).toBe('Amazon')
    expect(result!.total).toBe(2499)
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].description).toBe('Headphones')
    expect(result!.items[0].amount).toBe(2499)
  })

  it('extracts from @graph array', () => {
    const html = makeHtml({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Shop' },
        { '@type': 'Order', price: '10.00', priceCurrency: 'GBP', orderDate: '2026-03-01T00:00:00Z', merchant: { name: 'Shop' }, orderedItem: [] },
      ],
    })
    const result = extractJsonLdOrder(html)
    expect(result?.merchant).toBe('Shop')
  })

  it('returns null for non-Order JSON-LD', () => {
    const html = makeHtml({ '@type': 'Product', name: 'Widget' })
    expect(extractJsonLdOrder(html)).toBeNull()
  })
})
