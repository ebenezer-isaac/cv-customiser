#!/usr/bin/env node
/**
 * Test runner for domain-centric Apollo search implementation
 * Runs all tests and reports results
 */

const { execSync } = require('child_process');
const path = require('path');

const testFiles = [
  'test/apolloService.test.js',
  'test/apolloService.domainCentric.test.js',
  'test/prompts.domainCentric.test.js',
  'test/apiController.domainCentric.test.js'
];

console.log('==========================================');
console.log('Domain-Centric Apollo Search Test Suite');
console.log('==========================================\n');

let allTestsPassed = true;

for (const testFile of testFiles) {
  const testPath = path.join(__dirname, '..', testFile);
  console.log(`\n📋 Running ${testFile}...`);
  console.log('------------------------------------------');
  
  try {
    execSync(`node ${testPath}`, { stdio: 'inherit' });
    console.log(`✅ ${testFile} PASSED`);
  } catch (error) {
    console.error(`❌ ${testFile} FAILED`);
    allTestsPassed = false;
  }
  
  console.log('------------------------------------------');
}

console.log('\n==========================================');
if (allTestsPassed) {
  console.log('✅ ALL TESTS PASSED');
  console.log('==========================================\n');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('==========================================\n');
  process.exit(1);
}
