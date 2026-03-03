import 'dotenv/config'; // Load .env before any other imports
import { createApp, logger } from './app';

const PORT = process.env.PORT || 3000;

const app = createApp();

app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
    logger.info(`📡 POST /identify endpoint ready`);
});
