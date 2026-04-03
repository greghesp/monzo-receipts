import { buildParsingPrompt, htmlToText } from '../claude'

describe('htmlToText', () => {
  it('strips all HTML tags', () => {
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world')
  })

  it('inserts newlines for block-level elements', () => {
    const result = htmlToText('<p>line one</p><p>line two</p>')
    expect(result).toContain('line one')
    expect(result).toContain('line two')
    expect(result.indexOf('line one')).toBeLessThan(result.indexOf('line two'))
  })

  it('removes style blocks entirely (not just the tags)', () => {
    const result = htmlToText('<style>.foo { color: red; }</style><p>visible</p>')
    expect(result).not.toContain('color')
    expect(result).toContain('visible')
  })

  it('removes script blocks entirely', () => {
    const result = htmlToText('<script>alert("xss")</script><p>safe</p>')
    expect(result).not.toContain('alert')
    expect(result).toContain('safe')
  })

  it('decodes HTML entities', () => {
    // &nbsp; decodes to a space but is then collapsed with surrounding spaces
    expect(htmlToText('&amp; &lt; &gt; &nbsp; &pound;')).toBe('& < > £')
  })

  it('decodes numeric character references', () => {
    expect(htmlToText('&#163;9.99')).toBe('£9.99')
  })

  it('collapses multiple blank lines to at most two newlines', () => {
    const result = htmlToText('<br><br><br><br><br>')
    expect(result.split('\n').length).toBeLessThanOrEqual(3)
  })

  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('handles plain text with no tags', () => {
    expect(htmlToText('just plain text')).toBe('just plain text')
  })
})

describe('buildParsingPrompt', () => {
  it('includes email content in prompt', () => {
    const prompt = buildParsingPrompt('Amazon', 'Your order total is £9.99', 'amazon@amazon.co.uk')
    expect(prompt).toContain('amazon@amazon.co.uk')
    expect(prompt).toContain('£9.99')
  })

  it('requests JSON output', () => {
    const prompt = buildParsingPrompt('Test', 'body', 'test@test.com')
    expect(prompt.toLowerCase()).toContain('json')
  })
})
