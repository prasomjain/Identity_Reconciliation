import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { identifyRouter } from './routes/identify';
import pino from 'pino';

export const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
        process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
});

export function createApp() {
    const app = express();

    // ── Middleware ────────────────────────────────────────────────────────
    app.use(cors());
    app.use(express.json());

    // Rate limiting: 100 requests per minute per IP
    const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
    });
    app.use(limiter);

    // ── Routes ───────────────────────────────────────────────────────────

    // Health check
    app.get('/', (_req, res) => {
        res.json({ status: 'ok', service: 'bitespeed-identity' });
    });

    // Identity reconciliation endpoint
    app.use('/identify', identifyRouter);

    // ── Global error handler ─────────────────────────────────────────────
    app.use(
        (
            err: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
        ) => {
            logger.error({ err }, 'Unhandled error');
            res.status(500).json({ error: 'Internal server error' });
        },
    );

    return app;
}
