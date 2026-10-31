/**
 * Cryptographic utilities.
 *
 * Content IDs are SHA-256 hashes of "provider:native_content_id".
 * Uses the Web Crypto API (available in content scripts and service workers).
 */

/**
 * Compute SHA-256 hash of a string. Returns hex string.
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute the content ID for a provider + native ID pair.
 *
 * contentId = sha256("netflix:81131850")
 */
export async function computeContentId(
  provider: string,
  nativeId: string,
): Promise<string> {
  return sha256(`${provider}:${nativeId}`);
}

/**
 * Get the hash prefix for k-anonymity API lookups.
 * Default prefix length: 4 characters.
 */
export function hashPrefix(hash: string, length = 4): string {
  return hash.substring(0, length);
}
