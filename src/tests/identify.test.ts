import request from 'supertest';
import { createApp } from '../app';
import prisma from '../db/prismaClient';

const app = createApp();

/**
 * Integration tests for the /identify endpoint.
 *
 * These tests follow the examples from the Bitespeed assignment PDF (pages 3–9).
 * They require a running PostgreSQL database pointed to by DATABASE_URL.
 *
 * Before each test, the contacts table is cleared to ensure isolation.
 */
beforeEach(async () => {
    // Clean all contacts before each test
    await prisma.contact.deleteMany({});
});

afterAll(async () => {
    // Clean up and disconnect after all tests
    await prisma.contact.deleteMany({});
    await prisma.$disconnect();
});

describe('POST /identify', () => {
    // ── Validation Tests ──────────────────────────────────────────────────

    describe('Input validation', () => {
        it('should return 400 when neither email nor phoneNumber is provided', async () => {
            const res = await request(app).post('/identify').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('should return 400 when both fields are null', async () => {
            const res = await request(app)
                .post('/identify')
                .send({ email: null, phoneNumber: null });
            expect(res.status).toBe(400);
        });

        it('should return 400 when both fields are empty strings', async () => {
            const res = await request(app)
                .post('/identify')
                .send({ email: '', phoneNumber: '' });
            expect(res.status).toBe(400);
        });
    });

    // ── Test Case 1: Create new primary (empty DB) ────────────────────────

    describe('Create new primary contact', () => {
        it('should create a new primary when no contacts exist', async () => {
            const res = await request(app)
                .post('/identify')
                .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

            expect(res.status).toBe(200);
            expect(res.body.contact).toBeDefined();
            expect(res.body.contact.primaryContatctId).toBeDefined();
            expect(res.body.contact.emails).toEqual(['lorraine@hillvalley.edu']);
            expect(res.body.contact.phoneNumbers).toEqual(['123456']);
            expect(res.body.contact.secondaryContactIds).toEqual([]);

            // Verify DB state
            const contacts = await prisma.contact.findMany();
            expect(contacts).toHaveLength(1);
            expect(contacts[0].linkPrecedence).toBe('primary');
            expect(contacts[0].linkedId).toBeNull();
        });

        it('should create a primary with only email', async () => {
            const res = await request(app)
                .post('/identify')
                .send({ email: 'new@example.com' });

            expect(res.status).toBe(200);
            expect(res.body.contact.emails).toEqual(['new@example.com']);
            expect(res.body.contact.phoneNumbers).toEqual([]);
            expect(res.body.contact.secondaryContactIds).toEqual([]);
        });

        it('should create a primary with only phoneNumber', async () => {
            const res = await request(app)
                .post('/identify')
                .send({ phoneNumber: '999888' });

            expect(res.status).toBe(200);
            expect(res.body.contact.phoneNumbers).toEqual(['999888']);
            expect(res.body.contact.emails).toEqual([]);
            expect(res.body.contact.secondaryContactIds).toEqual([]);
        });
    });

    // ── Test Case 2: Lorraine/McFly example (PDF pages 3–6) ──────────────

    describe('Add secondary when phone matches (Lorraine/McFly)', () => {
        it('should create a secondary contact when phone matches but email is new', async () => {
            // Seed: Lorraine is the existing primary
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'lorraine@hillvalley.edu',
                    linkPrecedence: 'primary',
                },
            });

            // McFly comes in with same phone, new email
            const res = await request(app)
                .post('/identify')
                .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);
            expect(res.body.contact.emails).toEqual([
                'lorraine@hillvalley.edu',
                'mcfly@hillvalley.edu',
            ]);
            expect(res.body.contact.phoneNumbers).toEqual(['123456']);
            expect(res.body.contact.secondaryContactIds).toHaveLength(1);

            // Verify DB state
            const contacts = await prisma.contact.findMany({
                orderBy: { createdAt: 'asc' },
            });
            expect(contacts).toHaveLength(2);
            expect(contacts[0].linkPrecedence).toBe('primary');
            expect(contacts[1].linkPrecedence).toBe('secondary');
            expect(contacts[1].linkedId).toBe(primary.id);
        });
    });

    // ── Test Case 3: Query with only phone or only email ──────────────────

    describe('Query with partial identifiers', () => {
        it('should return consolidated contact when querying with only phone', async () => {
            // Seed
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'lorraine@hillvalley.edu',
                    linkPrecedence: 'primary',
                },
            });
            await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'mcfly@hillvalley.edu',
                    linkedId: primary.id,
                    linkPrecedence: 'secondary',
                },
            });

            const res = await request(app)
                .post('/identify')
                .send({ phoneNumber: '123456' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);
            expect(res.body.contact.emails).toContain('lorraine@hillvalley.edu');
            expect(res.body.contact.emails).toContain('mcfly@hillvalley.edu');
            expect(res.body.contact.phoneNumbers).toEqual(['123456']);
        });

        it('should return consolidated contact when querying with only email', async () => {
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'lorraine@hillvalley.edu',
                    linkPrecedence: 'primary',
                },
            });
            await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'mcfly@hillvalley.edu',
                    linkedId: primary.id,
                    linkPrecedence: 'secondary',
                },
            });

            const res = await request(app)
                .post('/identify')
                .send({ email: 'mcfly@hillvalley.edu' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);
            expect(res.body.contact.emails).toContain('lorraine@hillvalley.edu');
            expect(res.body.contact.emails).toContain('mcfly@hillvalley.edu');
        });
    });

    // ── Test Case 4: Merge two primaries (PDF pages 8–9) ──────────────────

    describe('Merge two separate primaries', () => {
        it('should merge newer primary into older when request connects them', async () => {
            // Seed: Two separate primaries
            const primary1 = await prisma.contact.create({
                data: {
                    phoneNumber: '919191',
                    email: 'george@hillvalley.edu',
                    linkPrecedence: 'primary',
                    createdAt: new Date('2024-01-01T00:00:00Z'),
                },
            });

            const primary2 = await prisma.contact.create({
                data: {
                    phoneNumber: '717171',
                    email: 'biffsucks@hillvalley.edu',
                    linkPrecedence: 'primary',
                    createdAt: new Date('2024-01-02T00:00:00Z'),
                },
            });

            // Incoming request connects them: george's email + biff's phone
            const res = await request(app)
                .post('/identify')
                .send({ email: 'george@hillvalley.edu', phoneNumber: '717171' });

            expect(res.status).toBe(200);
            // Oldest primary should be the winner
            expect(res.body.contact.primaryContatctId).toBe(primary1.id);
            expect(res.body.contact.emails).toContain('george@hillvalley.edu');
            expect(res.body.contact.emails).toContain('biffsucks@hillvalley.edu');
            expect(res.body.contact.phoneNumbers).toContain('919191');
            expect(res.body.contact.phoneNumbers).toContain('717171');
            expect(res.body.contact.secondaryContactIds).toContain(primary2.id);

            // Verify DB: primary2 should now be secondary
            const updatedPrimary2 = await prisma.contact.findUnique({
                where: { id: primary2.id },
            });
            expect(updatedPrimary2?.linkPrecedence).toBe('secondary');
            expect(updatedPrimary2?.linkedId).toBe(primary1.id);
        });

        it('should re-link existing secondaries of merged primary', async () => {
            // Primary 1 (older)
            const primary1 = await prisma.contact.create({
                data: {
                    phoneNumber: '919191',
                    email: 'george@hillvalley.edu',
                    linkPrecedence: 'primary',
                    createdAt: new Date('2024-01-01T00:00:00Z'),
                },
            });

            // Primary 2 (newer) with a secondary
            const primary2 = await prisma.contact.create({
                data: {
                    phoneNumber: '717171',
                    email: 'biffsucks@hillvalley.edu',
                    linkPrecedence: 'primary',
                    createdAt: new Date('2024-01-02T00:00:00Z'),
                },
            });

            const secondary2 = await prisma.contact.create({
                data: {
                    phoneNumber: '717171',
                    email: 'biff@hillvalley.edu',
                    linkedId: primary2.id,
                    linkPrecedence: 'secondary',
                    createdAt: new Date('2024-01-03T00:00:00Z'),
                },
            });

            // Merge
            const res = await request(app)
                .post('/identify')
                .send({ email: 'george@hillvalley.edu', phoneNumber: '717171' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary1.id);

            // The secondary that was under primary2 should now point to primary1
            const updatedSecondary = await prisma.contact.findUnique({
                where: { id: secondary2.id },
            });
            expect(updatedSecondary?.linkedId).toBe(primary1.id);

            // All secondaries should be listed
            expect(res.body.contact.secondaryContactIds).toContain(primary2.id);
            expect(res.body.contact.secondaryContactIds).toContain(secondary2.id);
        });
    });

    // ── Test Case 5: Idempotent request ───────────────────────────────────

    describe('Idempotent requests', () => {
        it('should not create a new row when all info already exists', async () => {
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'lorraine@hillvalley.edu',
                    linkPrecedence: 'primary',
                },
            });

            // Same exact info
            const res = await request(app)
                .post('/identify')
                .send({ email: 'lorraine@hillvalley.edu', phoneNumber: '123456' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);

            // Should NOT create a new contact
            const contacts = await prisma.contact.findMany();
            expect(contacts).toHaveLength(1);
        });

        it('should not create duplicate secondaries on repeated requests', async () => {
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'lorraine@hillvalley.edu',
                    linkPrecedence: 'primary',
                },
            });

            // First request: creates secondary
            await request(app)
                .post('/identify')
                .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' });

            // Second identical request: should not create another secondary
            await request(app)
                .post('/identify')
                .send({ email: 'mcfly@hillvalley.edu', phoneNumber: '123456' });

            const contacts = await prisma.contact.findMany();
            expect(contacts).toHaveLength(2); // Only primary + one secondary
        });
    });

    // ── Test Case 6: Multiple secondaries ─────────────────────────────────

    describe('Multiple secondaries', () => {
        it('should list all secondary contact IDs', async () => {
            const primary = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'primary@example.com',
                    linkPrecedence: 'primary',
                },
            });

            const sec1 = await prisma.contact.create({
                data: {
                    phoneNumber: '123456',
                    email: 'secondary1@example.com',
                    linkedId: primary.id,
                    linkPrecedence: 'secondary',
                },
            });

            const sec2 = await prisma.contact.create({
                data: {
                    phoneNumber: '789012',
                    email: 'primary@example.com',
                    linkedId: primary.id,
                    linkPrecedence: 'secondary',
                },
            });

            const res = await request(app)
                .post('/identify')
                .send({ email: 'primary@example.com' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);
            expect(res.body.contact.secondaryContactIds).toHaveLength(2);
            expect(res.body.contact.secondaryContactIds).toContain(sec1.id);
            expect(res.body.contact.secondaryContactIds).toContain(sec2.id);
            expect(res.body.contact.emails).toHaveLength(2); // primary@, secondary1@ (deduped)
            expect(res.body.contact.phoneNumbers).toHaveLength(2); // 123456, 789012
        });
    });

    // ── Test Case 7: Email normalization ──────────────────────────────────

    describe('Email normalization', () => {
        it('should match case-insensitively on email', async () => {
            const primary = await prisma.contact.create({
                data: {
                    email: 'test@example.com',
                    phoneNumber: '111222',
                    linkPrecedence: 'primary',
                },
            });

            const res = await request(app)
                .post('/identify')
                .send({ email: 'TEST@EXAMPLE.COM', phoneNumber: '111222' });

            expect(res.status).toBe(200);
            expect(res.body.contact.primaryContatctId).toBe(primary.id);

            // Should not create a duplicate
            const contacts = await prisma.contact.findMany();
            expect(contacts).toHaveLength(1);
        });
    });

    // ── Test Case 8: Concurrency ──────────────────────────────────────────

    describe('Concurrency', () => {
        it('should handle concurrent requests without creating duplicate primaries', async () => {
            // Create an initial contact
            await prisma.contact.create({
                data: {
                    email: 'root@example.com',
                    phoneNumber: '000000',
                    linkPrecedence: 'primary',
                },
            });

            // Send multiple concurrent requests that all link to this contact
            const promises = Array.from({ length: 5 }, (_, i) =>
                request(app)
                    .post('/identify')
                    .send({ email: 'root@example.com', phoneNumber: `00000${i + 1}` }),
            );

            const results = await Promise.all(promises);

            // All should succeed
            for (const res of results) {
                expect(res.status).toBe(200);
            }

            // Verify: exactly one primary
            const primaries = await prisma.contact.findMany({
                where: { linkPrecedence: 'primary' },
            });
            expect(primaries).toHaveLength(1);
        });
    });

    // ── Test Case 9: Soft-deleted contacts are ignored ────────────────────

    describe('Soft deletes', () => {
        it('should ignore soft-deleted contacts', async () => {
            // Create a soft-deleted contact
            await prisma.contact.create({
                data: {
                    email: 'deleted@example.com',
                    phoneNumber: '555555',
                    linkPrecedence: 'primary',
                    deletedAt: new Date(),
                },
            });

            // This should create a new primary, ignoring the deleted one
            const res = await request(app)
                .post('/identify')
                .send({ email: 'deleted@example.com' });

            expect(res.status).toBe(200);
            const newId = res.body.contact.primaryContatctId;

            // Should NOT be the deleted contact
            const contacts = await prisma.contact.findMany({
                where: { deletedAt: null },
            });
            expect(contacts).toHaveLength(1);
            expect(contacts[0].id).toBe(newId);
            expect(contacts[0].linkPrecedence).toBe('primary');
        });
    });
});
