import { Router, Request, Response } from 'express';
import { identifyContact } from '../services/contactService';
import { normalizeEmail, normalizePhone } from '../utils/normalizers';
import { logger } from '../app';

export const identifyRouter = Router();

interface IdentifyRequestBody {
    email?: string | null;
    phoneNumber?: string | null;
}

/**
 * POST /identify
 *
 * Accepts { email?, phoneNumber? } and returns the consolidated contact
 * information linking all related contacts together.
 */
identifyRouter.post('/', async (req: Request, res: Response) => {
    try {
        const body: IdentifyRequestBody = req.body;

        // ── Input validation ────────────────────────────────────────────────
        const email = normalizeEmail(body.email);
        const phoneNumber = normalizePhone(body.phoneNumber);

        if (!email && !phoneNumber) {
            return res.status(400).json({
                error: 'At least one of email or phoneNumber must be provided and non-empty.',
            });
        }

        // Validate lengths
        if (email && email.length > 320) {
            return res.status(400).json({ error: 'Email exceeds maximum length of 320 characters.' });
        }
        if (phoneNumber && phoneNumber.length > 50) {
            return res.status(400).json({
                error: 'Phone number exceeds maximum length of 50 characters.',
            });
        }

        // ── Business logic ──────────────────────────────────────────────────
        logger.info({ email, phoneNumber }, 'Processing /identify request');

        const result = await identifyContact(email, phoneNumber);

        logger.info(
            { primaryContactId: result.primaryContatctId, secondaryCount: result.secondaryContactIds.length },
            'Identify result',
        );

        return res.status(200).json({ contact: result });
    } catch (error) {
        logger.error({ error }, 'Error processing /identify request');
        return res.status(500).json({ error: 'Internal server error' });
    }
});
