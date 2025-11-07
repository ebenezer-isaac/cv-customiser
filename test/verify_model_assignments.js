#!/usr/bin/env node

/**
 * Verification script for AI Service Model Assignments
 * Ensures all methods use the appropriate model (Pro vs Flash) based on complexity
 */

const fs = require('fs');
const path = require('path');

console.log('=== AI Service Model Assignment Verification ===\n');

const aiServicePath = path.join(__dirname, '../src/services/aiService.js');
const aiServiceContent = fs.readFileSync(aiServicePath, 'utf-8');

let allChecksPassed = true;

function check(description, condition) {
  if (condition) {
    console.log(`✓ ${description}`);
    return true;
  } else {
    console.log(`✗ ${description}`);
    allChecksPassed = false;
    return false;
  }
}

console.log('1. Checking Flash Model Assignments (Simple/Fast Tasks)...');
console.log('   These methods should use MODEL_TYPES.FLASH for cost efficiency:\n');

// Check extractJobDescriptionContent uses Flash
const extractJobDescMatch = aiServiceContent.match(/async extractJobDescriptionContent[\s\S]*?await this\.generateWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('extractJobDescriptionContent() uses Flash model', !!extractJobDescMatch);

// Check extractJobDetails uses Flash
const extractJobDetailsMatch = aiServiceContent.match(/async extractJobDetails[\s\S]*?await this\.generateJsonWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('extractJobDetails() uses Flash model', !!extractJobDetailsMatch);

// Check generateCVChangeSummary uses Flash
const cvChangeSummaryMatch = aiServiceContent.match(/async generateCVChangeSummary[\s\S]*?await this\.generateWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('generateCVChangeSummary() uses Flash model', !!cvChangeSummaryMatch);

// Check parseColdOutreachInput uses Flash
const parseColdOutreachMatch = aiServiceContent.match(/async parseColdOutreachInput[\s\S]*?await this\.generateJsonWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('parseColdOutreachInput() uses Flash model', !!parseColdOutreachMatch);

// Check processJobURL uses Flash
const processJobURLMatch = aiServiceContent.match(/async processJobURL[\s\S]*?await this\.generateJsonWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('processJobURL() uses Flash model', !!processJobURLMatch);

// Check processJobText uses Flash
const processJobTextMatch = aiServiceContent.match(/async processJobText[\s\S]*?await this\.generateJsonWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('processJobText() uses Flash model', !!processJobTextMatch);

// Check getIntelligence uses Flash
const getIntelligenceMatch = aiServiceContent.match(/async getIntelligence[\s\S]*?await this\.generateJsonWithRetry\(prompt,\s*MODEL_TYPES\.FLASH\)/);
check('getIntelligence() uses Flash model', !!getIntelligenceMatch);

console.log('\n2. Checking Pro Model Assignments (Complex Tasks)...');
console.log('   These methods should use Pro model (default) for quality:\n');

// Check generateCVAdvanced does NOT specify Flash (uses default Pro)
const generateCVMatch = aiServiceContent.match(/async generateCVAdvanced[\s\S]{0,300}?await this\.generateWithRetry\(prompt\)/);
check('generateCVAdvanced() uses Pro model (default)', !!generateCVMatch);

// Check fixCVPageCount does NOT specify Flash
const fixCVMatch = aiServiceContent.match(/async fixCVPageCount[\s\S]{0,500}?await this\.generateWithRetry\(prompt\)/);
check('fixCVPageCount() uses Pro model (default)', !!fixCVMatch);

// Check generateCoverLetterAdvanced does NOT specify Flash
const coverLetterMatch = aiServiceContent.match(/async generateCoverLetterAdvanced[\s\S]{0,400}?await this\.generateWithRetry\(prompt\)/);
check('generateCoverLetterAdvanced() uses Pro model (default)', !!coverLetterMatch);

// Check generateColdEmailAdvanced does NOT specify Flash
const coldEmailMatch = aiServiceContent.match(/async generateColdEmailAdvanced[\s\S]{0,400}?await this\.generateWithRetry\(prompt\)/);
check('generateColdEmailAdvanced() uses Pro model (default)', !!coldEmailMatch);

// Check generatePersonalizedColdEmail does NOT specify Flash
const personalizedEmailMatch = aiServiceContent.match(/async generatePersonalizedColdEmail[\s\S]{0,400}?await this\.generateWithRetry\(prompt\)/);
check('generatePersonalizedColdEmail() uses Pro model (default)', !!personalizedEmailMatch);

// Check generateGenericColdEmail does NOT specify Flash
const genericEmailMatch = aiServiceContent.match(/async generateGenericColdEmail[\s\S]{0,400}?await this\.generateWithRetry\(prompt\)/);
check('generateGenericColdEmail() uses Pro model (default)', !!genericEmailMatch);

// Check refineContentAdvanced does NOT specify Flash
const refineMatch = aiServiceContent.match(/async refineContentAdvanced[\s\S]{0,400}?await this\.generateWithRetry\(prompt\)/);
check('refineContentAdvanced() uses Pro model (default)', !!refineMatch);

// Check generateCompanyProfile does NOT specify Flash (complex research)
const companyProfileMatch = aiServiceContent.match(/async generateCompanyProfile[\s\S]{0,300}?await this\.generateJsonWithRetry\(prompt\)/);
check('generateCompanyProfile() uses Pro model (default)', !!companyProfileMatch);

// Check researchCompanyAndIdentifyPeople does NOT specify Flash (complex research)
const researchMatch = aiServiceContent.match(/async researchCompanyAndIdentifyPeople[\s\S]{0,500}?await this\.generateJsonWithRetry\(prompt\)/);
check('researchCompanyAndIdentifyPeople() uses Pro model (default)', !!researchMatch);

console.log('\n3. Checking Data Structure Compatibility...');
console.log('   Verifying return types and error handling remain intact:\n');

// Check that all JSON methods still have try-catch with fallbacks
const jsonMethodsWithFallback = [
  'extractJobDetails',
  'generateCompanyProfile', 
  'parseColdOutreachInput',
  'researchCompanyAndIdentifyPeople'
];

for (const method of jsonMethodsWithFallback) {
  const hasTryCatch = new RegExp(`async ${method}[\\s\\S]*?try[\\s\\S]*?catch`).test(aiServiceContent);
  check(`${method}() has try-catch error handling`, hasTryCatch);
}

console.log('\n4. Checking Method Signatures Unchanged...');
console.log('   Verifying backward compatibility:\n');

// Verify generateJsonWithRetry signature accepts modelType with default
const jsonRetrySignature = /async generateJsonWithRetry\(prompt,\s*modelType\s*=\s*'pro'\)/.test(aiServiceContent);
check('generateJsonWithRetry() has backward-compatible signature', jsonRetrySignature);

// Verify generateWithRetry signature accepts modelType with default
const textRetrySignature = /async generateWithRetry\(prompt,\s*modelType\s*=\s*'pro'\)/.test(aiServiceContent);
check('generateWithRetry() has backward-compatible signature', textRetrySignature);

console.log('\n5. Checking Model Initialization...');
console.log('   Verifying both models are properly initialized:\n');

check('proModel is initialized', aiServiceContent.includes('this.proModel ='));
check('flashModel is initialized', aiServiceContent.includes('this.flashModel ='));
check('MODEL_TYPES constant exists', aiServiceContent.includes('const MODEL_TYPES'));
check('Legacy model reference points to proModel', aiServiceContent.includes('this.model = this.proModel'));

console.log('\n=== Summary ===\n');

// Calculate cost savings
const flashMethods = 7;
const proMethods = 9;
const totalMethods = flashMethods + proMethods;
const flashPercentage = ((flashMethods / totalMethods) * 100).toFixed(1);

console.log(`Total AI Methods: ${totalMethods}`);
console.log(`Flash Model (Fast/Cheap): ${flashMethods} methods (${flashPercentage}%)`);
console.log(`Pro Model (Powerful): ${proMethods} methods (${100 - flashPercentage}%)`);
console.log('');
console.log('Expected Benefits:');
console.log('  • ~50% cost reduction on parsing/extraction tasks');
console.log('  • Faster response times for simple operations');
console.log('  • Quality maintained for complex generation tasks');
console.log('');

if (allChecksPassed) {
  console.log('✓ All model assignments verified! Dual-model architecture is correctly implemented.');
  process.exit(0);
} else {
  console.log('✗ Some checks failed. Please review the model assignments.');
  process.exit(1);
}
