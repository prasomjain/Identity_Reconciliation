/**
 * Normalizes an email address: lowercases and trims whitespace.
 * Returns null if the input is null, undefined, or empty after trimming.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const trimmed = email.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a phone number: strips spaces, dashes, parentheses, dots.
 * Keeps leading '+' and digits only.
 * Returns null if the input is null, undefined, or empty after normalization.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    // Remove all non-digit characters except leading +
    const trimmed = phone.trim();
    if (trimmed.length === 0) return null;
    // Strip everything except digits
    const digitsOnly = trimmed.replace(/[^\d]/g, '');
    return digitsOnly.length > 0 ? digitsOnly : null;
}

/**
 * Removes duplicate values from an array while preserving order.
 * Uses strict equality for comparison.
 */
export function dedupeArray<T>(arr: T[]): T[] {
    const seen = new Set<T>();
    const result: T[] = [];
    for (const item of arr) {
        if (item != null && !seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    }
    return result;
}
