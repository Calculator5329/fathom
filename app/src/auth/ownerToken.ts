interface FirebaseTokenUser {
  getIdToken(forceRefresh?: boolean): Promise<string>
}

interface ClipboardWriter {
  writeText(value: string): Promise<void>
}

/**
 * Copies a force-refreshed token without returning, rendering, or logging it.
 * The caller owns the generic success/error UI and must never include the
 * credential in either message.
 */
export async function copyFreshOwnerIdToken(
  user: FirebaseTokenUser | null,
  clipboard: ClipboardWriter,
): Promise<void> {
  if (!user) throw new Error('Sign in before requesting an owner token')

  const token = await user.getIdToken(true)
  if (!token) throw new Error('Firebase returned an empty owner token')
  await clipboard.writeText(token)
}
