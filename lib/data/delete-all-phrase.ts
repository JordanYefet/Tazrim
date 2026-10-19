/**
 * The phrase the user types to confirm deleting all data (ENG-62). Shared by
 * the Settings dialog and the API route, which checks it again.
 */
export const DELETE_ALL_PHRASE = 'מחק הכל'

/** True when `typed` is the phrase, ignoring surrounding and repeated spaces. */
export function matchesDeleteAllPhrase(typed: unknown): boolean {
  if (typeof typed !== 'string') return false
  return typed.normalize('NFC').trim().replace(/\s+/g, ' ') === DELETE_ALL_PHRASE
}
