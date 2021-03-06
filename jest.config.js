module.exports = {
  setupFilesAfterEnv: ['<rootDir>/test/server/setup.ts'],
  testMatch: ['**/test/**/*.ts'],
  testPathIgnorePatterns: ['/server/', '/dist/', '/helpers/'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
    '.*\\.(vue)$': '<rootDir>/node_modules/vue-jest'
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'vue'],
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,js}'],
  coveragePathIgnorePatterns: ['<rootDir>/src.*/index.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
