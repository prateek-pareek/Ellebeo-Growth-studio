/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@ai/(.*)$': '<rootDir>/ai/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@types-local/(.*)$': '<rootDir>/ai/types/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coveragePathIgnorePatterns: ['\\.spec\\.ts$', '\\.module\\.ts$', 'main\\.ts$'],
};
