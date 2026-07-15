import { describe, expect, it, vi } from 'vitest'
import { copyFreshOwnerIdToken } from './ownerToken'

describe('copyFreshOwnerIdToken', () => {
  it('force-refreshes and copies the token without returning it', async () => {
    const getIdToken = vi.fn().mockResolvedValue('credential-bytes')
    const writeText = vi.fn().mockResolvedValue(undefined)

    const result = await copyFreshOwnerIdToken({ getIdToken }, { writeText })

    expect(result).toBeUndefined()
    expect(getIdToken).toHaveBeenCalledExactlyOnceWith(true)
    expect(writeText).toHaveBeenCalledExactlyOnceWith('credential-bytes')
  })

  it('fails before touching the clipboard when no user is signed in', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(copyFreshOwnerIdToken(null, { writeText })).rejects.toThrow('Sign in')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('does not copy an empty token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(
      copyFreshOwnerIdToken({ getIdToken: vi.fn().mockResolvedValue('') }, { writeText }),
    ).rejects.toThrow('empty')
    expect(writeText).not.toHaveBeenCalled()
  })
})
