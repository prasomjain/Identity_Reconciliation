import prisma from '../db/prismaClient';
import { dedupeArray } from '../utils/normalizers';
import { logger } from '../app';

// Inline Contact type since Prisma v5 exposes it via result type
type Contact = {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
};

/**
 * Response shape matching the PDF specification.
 * Note: uses `primaryContatctId` (with typo) to match PDF grading expectations.
 */
export interface IdentifyResponse {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
}

/**
 * Retries the given async function up to maxRetries times when a Prisma
 * serialization error (P2034) is encountered. This handles concurrent requests
 * that conflict under SERIALIZABLE isolation on PostgreSQL.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: unknown) {
            const isSerializationError =
                err instanceof Error &&
                'code' in err &&
                (err as { code: string }).code === 'P2034';
            if (isSerializationError && attempt < maxRetries) {
                attempt++;
                // Exponential backoff: 50ms, 100ms, 200ms
                await new Promise((r) => setTimeout(r, 50 * Math.pow(2, attempt - 1)));
                continue;
            }
            throw err;
        }
    }
}

/**
 * Core identity reconciliation logic.
 *
 * Algorithm:
 * 1. Find all contacts matching the given email OR phone (exclude soft-deleted).
 * 2. Resolve each match to its primary (follow linkedId if secondary).
 * 3. Load all contacts in the linked set(s).
 * 4. If no matches → create a new primary contact.
 * 5. If single primary → optionally create a secondary for new info.
 * 6. If multiple primaries → merge into the oldest, re-link secondaries.
 * 7. Return consolidated response with deduped emails/phones, primary first.
 *
 * All mutations happen inside a serializable transaction to prevent races.
 * Serialization failures are automatically retried (up to 3 times).
 */
export async function identifyContact(
    email: string | null,
    phoneNumber: string | null,
): Promise<IdentifyResponse> {
    return withRetry(() =>
        prisma.$transaction(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (tx: any) => {
                // ── Step 1: Find candidate contacts ─────────────────────────
                const orConditions = [];
                if (email) orConditions.push({ email });
                if (phoneNumber) orConditions.push({ phoneNumber });

                const matchedContacts: Contact[] = await tx.contact.findMany({
                    where: {
                        AND: [
                            { deletedAt: null },
                            { OR: orConditions },
                        ],
                    },
                    orderBy: { createdAt: 'asc' },
                });

                // ── Step 2: No matches → create new primary ────────────────
                if (matchedContacts.length === 0) {
                    const newContact: Contact = await tx.contact.create({
                        data: {
                            email,
                            phoneNumber,
                            linkPrecedence: 'primary',
                        },
                    });

                    logger.info({ contactId: newContact.id }, 'Created new primary contact');

                    return buildResponse(newContact, []);
                }

                // ── Step 3: Resolve all distinct primaries ─────────────────
                const primaryIds = new Set<number>();
                const primaryMap = new Map<number, Contact>();

                for (const contact of matchedContacts) {
                    let primaryId: number;

                    if (contact.linkPrecedence === 'primary') {
                        primaryId = contact.id;
                        primaryMap.set(primaryId, contact);
                    } else {
                        // Secondary → follow linkedId to find primary
                        primaryId = contact.linkedId!;
                        if (!primaryMap.has(primaryId)) {
                            const primary: Contact | null = await tx.contact.findUnique({
                                where: { id: primaryId },
                            });
                            if (primary) {
                                primaryMap.set(primaryId, primary);
                            }
                        }
                    }
                    primaryIds.add(primaryId);
                }

                // ── Step 4: Load all contacts in linked set(s) ────────────
                const allPrimaryIds = Array.from(primaryIds);
                const allContacts: Contact[] = await tx.contact.findMany({
                    where: {
                        AND: [
                            { deletedAt: null },
                            {
                                OR: [
                                    { id: { in: allPrimaryIds } },
                                    { linkedId: { in: allPrimaryIds } },
                                ],
                            },
                        ],
                    },
                    orderBy: { createdAt: 'asc' },
                });

                // ── Step 5: Determine the final primary (oldest createdAt) ─
                const primaries = allContacts
                    .filter((c: Contact) => c.linkPrecedence === 'primary')
                    .sort((a: Contact, b: Contact) => a.createdAt.getTime() - b.createdAt.getTime());

                const finalPrimary = primaries[0];

                // ── Step 6: Merge if multiple primaries ────────────────────
                if (primaries.length > 1) {
                    const otherPrimaries = primaries.slice(1);
                    const otherPrimaryIds = otherPrimaries.map((p: Contact) => p.id);

                    logger.info(
                        {
                            finalPrimaryId: finalPrimary.id,
                            mergedPrimaryIds: otherPrimaryIds,
                        },
                        'Merging primaries into oldest',
                    );

                    // Convert other primaries to secondaries
                    await tx.contact.updateMany({
                        where: { id: { in: otherPrimaryIds } },
                        data: {
                            linkPrecedence: 'secondary',
                            linkedId: finalPrimary.id,
                            updatedAt: new Date(),
                        },
                    });

                    // Re-link any secondaries that pointed to the merged primaries
                    await tx.contact.updateMany({
                        where: {
                            linkedId: { in: otherPrimaryIds },
                            linkPrecedence: 'secondary',
                        },
                        data: {
                            linkedId: finalPrimary.id,
                            updatedAt: new Date(),
                        },
                    });
                }

                // ── Step 7: Check if we need to create a new secondary ─────
                const existingEmails = new Set(
                    allContacts.map((c: Contact) => c.email).filter(Boolean) as string[],
                );
                const existingPhones = new Set(
                    allContacts.map((c: Contact) => c.phoneNumber).filter(Boolean) as string[],
                );

                const hasNewEmail = email && !existingEmails.has(email);
                const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

                if (hasNewEmail || hasNewPhone) {
                    const newSecondary: Contact = await tx.contact.create({
                        data: {
                            email,
                            phoneNumber,
                            linkedId: finalPrimary.id,
                            linkPrecedence: 'secondary',
                        },
                    });

                    logger.info(
                        { contactId: newSecondary.id, linkedTo: finalPrimary.id },
                        'Created new secondary contact',
                    );
                }

                // ── Step 8: Re-fetch all contacts to build final response ──
                const finalContacts: Contact[] = await tx.contact.findMany({
                    where: {
                        AND: [
                            { deletedAt: null },
                            {
                                OR: [
                                    { id: finalPrimary.id },
                                    { linkedId: finalPrimary.id },
                                ],
                            },
                        ],
                    },
                    orderBy: { createdAt: 'asc' },
                });

                const finalPrimaryContact = finalContacts.find(
                    (c: Contact) => c.id === finalPrimary.id,
                )!;
                const secondaries = finalContacts.filter(
                    (c: Contact) => c.id !== finalPrimary.id,
                );

                return buildResponse(finalPrimaryContact, secondaries);
            },
            {
                // Use serializable isolation to prevent race conditions
                isolationLevel: 'Serializable',
                timeout: 10000,
            },
        ),
    );
}

/**
 * Builds the consolidated response from primary contact and its secondaries.
 * Ensures primary's values appear first in the arrays; deduplicates.
 */
function buildResponse(
    primary: Contact,
    secondaries: Contact[],
): IdentifyResponse {
    const emails: (string | null)[] = [primary.email];
    const phoneNumbers: (string | null)[] = [primary.phoneNumber];

    for (const sec of secondaries) {
        emails.push(sec.email);
        phoneNumbers.push(sec.phoneNumber);
    }

    return {
        primaryContatctId: primary.id,
        emails: dedupeArray(emails.filter(Boolean) as string[]),
        phoneNumbers: dedupeArray(phoneNumbers.filter(Boolean) as string[]),
        secondaryContactIds: secondaries.map((s: Contact) => s.id),
    };
}
