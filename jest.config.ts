import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    clearMocks: true,
    // Load .env file before tests run so DATABASE_URL is available
    setupFiles: ['dotenv/config'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/tests/**',
        '!src/server.ts',
    ],
    coverageDirectory: 'coverage',
    verbose: true,
};

export default config;
