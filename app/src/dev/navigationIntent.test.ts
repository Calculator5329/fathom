import { describe, expect, it } from 'vitest'
import { navigationProposal } from './navigationIntent'
describe('bounded voice navigation proposals', () => {
  it('maps supported speech to existing public Handles identities', () => {
    expect(navigationProposal('Please open research.')).toMatchObject({ handle: 'app.nav.stock' })
    expect(navigationProposal('take me to asset allocation')).toMatchObject({ handle: 'app.nav.allocation' })
  })
  it('does not infer privileged, ambiguous or arbitrary commands', () => {
    for (const text of ['open research then buy stock', 'click app.header.sign-in', 'delete everything', 'research or income', '']) expect(navigationProposal(text)).toBeNull()
  })
})
