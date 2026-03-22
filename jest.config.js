module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/renderer/**/*.ts',
    '!src/plugins/**/*.ts'
  ],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
  }
};
