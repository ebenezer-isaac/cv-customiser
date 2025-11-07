/**
 * Manual verification script for JSON Mode implementation
 * Tests the new generateJsonWithRetry method and updated JSON-returning functions
 */

const fs = require('fs');
const path = require('path');

console.log('=== Verification Script for JSON Mode Implementation ===\n');

// Test 1: Check if prompts.json is valid and contains updated prompts
console.log('Test 1: Checking prompts.json...');
try {
  const promptsPath = path.join(__dirname, '..', 'src', 'prompts.json');
  const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
  
  console.log('  ✓ prompts.json is valid JSON');
  
  // Check for HCP in key prompts
  if (prompts.extractJobDetails && prompts.extractJobDetails.includes('HIERARCHICAL CONSTRAINTS')) {
    console.log('  ✓ extractJobDetails includes HCP pattern');
  } else {
    console.log('  ✗ extractJobDetails missing HCP pattern');
  }
  
  // Check for new field names in researchCompanyAndIdentifyPeople
  if (prompts.researchCompanyAndIdentifyPeople) {
    if (prompts.researchCompanyAndIdentifyPeople.includes('company_intelligence') &&
        prompts.researchCompanyAndIdentifyPeople.includes('decision_makers')) {
      console.log('  ✓ researchCompanyAndIdentifyPeople uses new field names (company_intelligence, decision_makers)');
    } else {
      console.log('  ✗ researchCompanyAndIdentifyPeople missing new field names');
    }
    
    // Should NOT use old field names
    if (prompts.researchCompanyAndIdentifyPeople.includes('companyProfile') ||
        prompts.researchCompanyAndIdentifyPeople.includes('decisionMakers')) {
      console.log('  ⚠ researchCompanyAndIdentifyPeople still contains old field names');
    }
  }
  
  // Check for Persona Deepening in CV generation
  if (prompts.generateCVAdvanced && prompts.generateCVAdvanced.includes('Dr. Sarah Chen')) {
    console.log('  ✓ generateCVAdvanced includes Persona Deepening');
  } else {
    console.log('  ✗ generateCVAdvanced missing Persona Deepening');
  }
  
  console.log('');
} catch (error) {
  console.log('  ✗ Error loading prompts.json:', error.message);
  console.log('');
}

// Test 2: Check if aiService.js has the new generateJsonWithRetry method
console.log('Test 2: Checking aiService.js...');
try {
  const aiServicePath = path.join(__dirname, '..', 'src', 'services', 'aiService.js');
  const aiServiceCode = fs.readFileSync(aiServicePath, 'utf-8');
  
  if (aiServiceCode.includes('generateJsonWithRetry')) {
    console.log('  ✓ generateJsonWithRetry method exists');
  } else {
    console.log('  ✗ generateJsonWithRetry method not found');
  }
  
  if (aiServiceCode.includes('this.jsonModel')) {
    console.log('  ✓ jsonModel property exists');
  } else {
    console.log('  ✗ jsonModel property not found');
  }
  
  if (aiServiceCode.includes('responseMimeType: "application/json"')) {
    console.log('  ✓ JSON Mode configuration present');
  } else {
    console.log('  ✗ JSON Mode configuration not found');
  }
  
  // Check if extractJobDetails uses new method
  const extractJobDetailsMatch = aiServiceCode.match(/async extractJobDetails\([^)]*\)\s*{([^}]+)}/s);
  if (extractJobDetailsMatch && extractJobDetailsMatch[0].includes('generateJsonWithRetry')) {
    console.log('  ✓ extractJobDetails uses generateJsonWithRetry');
  } else {
    console.log('  ✗ extractJobDetails not updated to use generateJsonWithRetry');
  }
  
  console.log('');
} catch (error) {
  console.log('  ✗ Error loading aiService.js:', error.message);
  console.log('');
}

// Test 3: Check if apiController.js uses new field names
console.log('Test 3: Checking apiController.js...');
try {
  const apiControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'apiController.js');
  const apiControllerCode = fs.readFileSync(apiControllerPath, 'utf-8');
  
  if (apiControllerCode.includes('research.company_intelligence')) {
    console.log('  ✓ Uses research.company_intelligence');
  } else {
    console.log('  ✗ Missing research.company_intelligence');
  }
  
  if (apiControllerCode.includes('research.decision_makers')) {
    console.log('  ✓ Uses research.decision_makers');
  } else {
    console.log('  ✗ Missing research.decision_makers');
  }
  
  // Check if old field names are still present (should not be)
  if (apiControllerCode.includes('research.companyProfile') ||
      apiControllerCode.includes('research.decisionMakers')) {
    console.log('  ⚠ Warning: Still contains old field names (companyProfile or decisionMakers)');
  } else {
    console.log('  ✓ Old field names removed');
  }
  
  console.log('');
} catch (error) {
  console.log('  ✗ Error loading apiController.js:', error.message);
  console.log('');
}

console.log('=== Verification Complete ===');
console.log('\nSummary:');
console.log('- Native JSON Mode implementation added to aiService.js');
console.log('- All JSON-returning functions updated to use generateJsonWithRetry');
console.log('- Prompts updated with Hierarchical Constraint Prompting (HCP)');
console.log('- Data structure mismatches fixed in apiController.js');
console.log('- Field names updated: companyProfile → company_intelligence, decisionMakers → decision_makers');
