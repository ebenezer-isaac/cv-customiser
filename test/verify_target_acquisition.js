#!/usr/bin/env node

/**
 * Verification script for Target Acquisition Algorithm implementation
 * This script validates that all the required changes have been made correctly
 */

const fs = require('fs');
const path = require('path');

console.log('=== Target Acquisition Algorithm Verification ===\n');

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

// 1. Check config.js has dual model configuration
console.log('1. Checking config.js for dual model configuration...');
const configPath = path.join(__dirname, '../src/config.js');
const configContent = fs.readFileSync(configPath, 'utf-8');
check('config.js contains proModel', configContent.includes('proModel:'));
check('config.js contains flashModel', configContent.includes('flashModel:'));
check('config.js has gemini-2.5-pro default', configContent.includes('gemini-2.5-pro'));
check('config.js has gemini-2.5-flash default', configContent.includes('gemini-2.5-flash'));
console.log('');

// 2. Check aiService.js has dual model initialization
console.log('2. Checking aiService.js for dual model initialization...');
const aiServicePath = path.join(__dirname, '../src/services/aiService.js');
const aiServiceContent = fs.readFileSync(aiServicePath, 'utf-8');
check('aiService.js initializes proModel', aiServiceContent.includes('this.proModel'));
check('aiService.js initializes flashModel', aiServiceContent.includes('this.flashModel'));
check('aiService.js has getIntelligence method', aiServiceContent.includes('async getIntelligence'));
check('aiService.js has MODEL_TYPES constant', aiServiceContent.includes('MODEL_TYPES'));
check('generateJsonWithRetry accepts modelType parameter', /async generateJsonWithRetry\(prompt,\s*modelType/.test(aiServiceContent));
check('generateWithRetry accepts modelType parameter', /async generateWithRetry\(prompt,\s*modelType/.test(aiServiceContent));
console.log('');

// 3. Check prompts.json has getIntelligence prompt
console.log('3. Checking prompts.json for getIntelligence prompt...');
const promptsPath = path.join(__dirname, '../src/prompts.json');
const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
const prompts = JSON.parse(promptsContent);
check('prompts.json has getIntelligence prompt', 'getIntelligence' in prompts);
check('getIntelligence prompt has HCP structure', prompts.getIntelligence && prompts.getIntelligence.includes('HIERARCHICAL CONSTRAINTS'));
check('getIntelligence prompt expects jobTitles array', prompts.getIntelligence && prompts.getIntelligence.includes('"jobTitles"'));
console.log('');

// 4. Check apolloService.js has Target Acquisition algorithm
console.log('4. Checking apolloService.js for Target Acquisition algorithm...');
const apolloServicePath = path.join(__dirname, '../src/services/apolloService.js');
const apolloServiceContent = fs.readFileSync(apolloServicePath, 'utf-8');
check('apolloService.js has findContact method', apolloServiceContent.includes('async findContact'));
check('apolloService.js has TARGET_ACQUISITION_CONFIG', apolloServiceContent.includes('TARGET_ACQUISITION_CONFIG'));
check('apolloService.js has SCORING constants', apolloServiceContent.includes('const SCORING'));
check('apolloService.js has calculateSpamScore method', apolloServiceContent.includes('calculateSpamScore'));
check('apolloService.js has scoreCandidate method', apolloServiceContent.includes('scoreCandidate'));
check('apolloService.js accepts aiService in constructor', /constructor\(aiService/.test(apolloServiceContent));
check('findContact has Phase 1: Intelligence Gathering', apolloServiceContent.includes('PHASE 1: INTELLIGENCE GATHERING'));
check('findContact has Phase 2: Multi-pass search', apolloServiceContent.includes('PHASE 2: MULTI-PASS SEARCH'));
check('findContact has Phase 3: Candidate scoring', apolloServiceContent.includes('PHASE 3: CANDIDATE SCORING'));
check('findContact has Phase 4: Iterative enrichment', apolloServiceContent.includes('PHASE 4: ITERATIVE ENRICHMENT'));
console.log('');

// 5. Check apiController.js uses new findContact method
console.log('5. Checking apiController.js for findContact usage...');
const apiControllerPath = path.join(__dirname, '../src/controllers/apiController.js');
const apiControllerContent = fs.readFileSync(apiControllerPath, 'utf-8');
check('apiController.js calls apolloService.findContact', apiControllerContent.includes('apolloService.findContact'));
check('apiController.js mentions Target Acquisition', apiControllerContent.includes('Target Acquisition'));
console.log('');

// 6. Check server.js passes aiService to apolloService
console.log('6. Checking server.js initialization...');
const serverPath = path.join(__dirname, '../src/server.js');
const serverContent = fs.readFileSync(serverPath, 'utf-8');
check('server.js passes aiService to ApolloService', /new ApolloService\(aiService\)/.test(serverContent));
console.log('');

// 7. Check that spam penalty calculation is correct
console.log('7. Checking spam penalty calculation...');
check('Spam penalty uses subtraction not addition', apolloServiceContent.includes('score -= penalty'));
check('SPAM_PENALTY_PER_INDICATOR is positive value', apolloServiceContent.includes('SPAM_PENALTY_PER_INDICATOR: 1000'));
console.log('');

// 8. Check for extensive logging
console.log('8. Checking for extensive logging...');
const apolloLogCount = (apolloServiceContent.match(/console\.log\(/g) || []).length;
const aiServiceLogCount = (aiServiceContent.match(/console\.log\(/g) || []).length;
check(`apolloService.js has extensive logging (${apolloLogCount} console.log statements)`, apolloLogCount >= 20);
check(`aiService.js has logging for dual models (${aiServiceLogCount} console.log statements)`, aiServiceLogCount >= 5);
console.log('');

// Final summary
console.log('=== Verification Summary ===');
if (allChecksPassed) {
  console.log('✓ All checks passed! Target Acquisition Algorithm implementation is complete.');
  process.exit(0);
} else {
  console.log('✗ Some checks failed. Please review the implementation.');
  process.exit(1);
}
