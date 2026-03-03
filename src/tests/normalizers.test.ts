import { normalizeEmail, normalizePhone, dedupeArray } from '../utils/normalizers';

describe('normalizeEmail', () => {
    it('lowercases and trims email', () => {
        expect(normalizeEmail('  McFly@HillValley.EDU  ')).toBe('mcfly@hillvalley.edu');
    });

    it('returns null for null/undefined/empty', () => {
        expect(normalizeEmail(null)).toBeNull();
        expect(normalizeEmail(undefined)).toBeNull();
        expect(normalizeEmail('')).toBeNull();
        expect(normalizeEmail('   ')).toBeNull();
    });

    it('handles normal email', () => {
        expect(normalizeEmail('test@example.com')).toBe('test@example.com');
    });
});

describe('normalizePhone', () => {
    it('strips non-digit characters', () => {
        expect(normalizePhone('+1 (234) 567-8900')).toBe('12345678900');
    });

    it('keeps plain digits', () => {
        expect(normalizePhone('123456')).toBe('123456');
    });

    it('handles dashes and spaces', () => {
        expect(normalizePhone('123-456-7890')).toBe('1234567890');
    });

    it('returns null for null/undefined/empty', () => {
        expect(normalizePhone(null)).toBeNull();
        expect(normalizePhone(undefined)).toBeNull();
        expect(normalizePhone('')).toBeNull();
        expect(normalizePhone('   ')).toBeNull();
    });

    it('strips dots', () => {
        expect(normalizePhone('123.456.7890')).toBe('1234567890');
    });
});

describe('dedupeArray', () => {
    it('removes duplicates preserving order', () => {
        expect(dedupeArray(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    });

    it('handles empty array', () => {
        expect(dedupeArray([])).toEqual([]);
    });

    it('filters out null/undefined', () => {
        expect(dedupeArray([null, 'a', undefined, 'a', null])).toEqual(['a']);
    });

    it('handles numbers', () => {
        expect(dedupeArray([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    });

    it('handles all unique values', () => {
        expect(dedupeArray(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
    });
});
