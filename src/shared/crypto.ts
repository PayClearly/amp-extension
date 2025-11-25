/**
 * Cryptographic utilities for the extension
 * Uses crypto-js for MD5 hashing
 */

import CryptoJS from 'crypto-js';

/**
 * Generate MD5 hash of a string
 * Uses crypto-js library for proper MD5 hashing
 */
export function md5Hash(input: string): string {
  return CryptoJS.MD5(input).toString();
}

