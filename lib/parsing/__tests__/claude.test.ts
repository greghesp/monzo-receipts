import { buildParsingPrompt } from '../claude'

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
