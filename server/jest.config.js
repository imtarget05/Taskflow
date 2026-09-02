module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  maxWorkers: 1,
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    'src/middlewares/**/*.ts',
    '!src/**/*.routes.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 45,
      branches: 40,
      functions: 45,
      lines: 45,
    },
  },
  clearMocks: true,
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 15000,
};