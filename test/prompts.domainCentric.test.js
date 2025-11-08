/**
 * Tests for prompts.json domain-centric updates
 * Validates that the researchCompanyAndIdentifyPeople prompt has been updated
 * to require the domain field in the company_intelligence structure
 */

const fs = require('fs');
const path = require('path');

console.log('Test 1: Verify prompts.json structure...');
try {
  const promptsPath = path.join(__dirname, '../src/prompts.json');
  const promptsContent = fs.readFileSync(promptsPath, 'utf8');
  const prompts = JSON.parse(promptsContent);
  
  if (!prompts.researchCompanyAndIdentifyPeople) {
    throw new Error('researchCompanyAndIdentifyPeople prompt not found');
  }
  
  console.log('✓ researchCompanyAndIdentifyPeople prompt exists');
} catch (err) {
  console.error('✗ Prompts.json structure test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 2: Verify domain field is in data structure...');
try {
  const promptsPath = path.join(__dirname, '../src/prompts.json');
  const promptsContent = fs.readFileSync(promptsPath, 'utf8');
  const prompts = JSON.parse(promptsContent);
  
  const prompt = prompts.researchCompanyAndIdentifyPeople;
  
  // Check that the domain field is mentioned in the structure
  if (!prompt.includes('"domain":')) {
    throw new Error('Domain field not found in company_intelligence structure');
  }
  
  // Check that it's positioned correctly (before description)
  const domainIndex = prompt.indexOf('"domain":');
  const descriptionIndex = prompt.indexOf('"description":');
  
  if (domainIndex === -1 || descriptionIndex === -1) {
    throw new Error('Cannot find domain or description fields');
  }
  
  if (domainIndex > descriptionIndex) {
    throw new Error('Domain field should be before description field');
  }
  
  console.log('✓ Domain field is in correct position in data structure');
} catch (err) {
  console.error('✗ Domain field structure test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 3: Verify domain is marked as CRITICAL...');
try {
  const promptsPath = path.join(__dirname, '../src/prompts.json');
  const promptsContent = fs.readFileSync(promptsPath, 'utf8');
  const prompts = JSON.parse(promptsContent);
  
  const prompt = prompts.researchCompanyAndIdentifyPeople;
  
  // Check for CRITICAL or similar emphasis on domain
  if (!prompt.includes('CRITICAL') || !prompt.includes('PRIMARY CORPORATE DOMAIN')) {
    throw new Error('Domain field is not marked as CRITICAL');
  }
  
  // Check that domain is described as MOST IMPORTANT
  if (!prompt.includes('MOST IMPORTANT')) {
    throw new Error('Domain should be described as MOST IMPORTANT');
  }
  
  console.log('✓ Domain field is properly emphasized as CRITICAL');
} catch (err) {
  console.error('✗ Domain emphasis test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 4: Verify domain examples are provided...');
try {
  const promptsPath = path.join(__dirname, '../src/prompts.json');
  const promptsContent = fs.readFileSync(promptsPath, 'utf8');
  const prompts = JSON.parse(promptsContent);
  
  const prompt = prompts.researchCompanyAndIdentifyPeople;
  
  // Check for domain examples
  if (!prompt.includes('google.com') || !prompt.includes('microsoft.com')) {
    throw new Error('Domain examples not found');
  }
  
  console.log('✓ Domain examples are provided');
} catch (err) {
  console.error('✗ Domain examples test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 5: Verify domain is in final reminder...');
try {
  const promptsPath = path.join(__dirname, '../src/prompts.json');
  const promptsContent = fs.readFileSync(promptsPath, 'utf8');
  const prompts = JSON.parse(promptsContent);
  
  const prompt = prompts.researchCompanyAndIdentifyPeople;
  
  // Check that the final CRITICAL REMINDER mentions domain
  if (!prompt.includes('CRITICAL REMINDER') || !prompt.includes('domain')) {
    throw new Error('Final CRITICAL REMINDER does not mention domain');
  }
  
  if (!prompt.includes('MANDATORY')) {
    throw new Error('Domain should be marked as MANDATORY in reminder');
  }
  
  console.log('✓ Domain is emphasized in final CRITICAL REMINDER');
} catch (err) {
  console.error('✗ Final reminder test failed:', err.message);
  process.exit(1);
}

console.log('\n✅ All prompts.json domain-centric tests passed!');
console.log('\nSummary of prompt updates validated:');
console.log('1. ✓ researchCompanyAndIdentifyPeople prompt exists');
console.log('2. ✓ Domain field is in correct position in data structure');
console.log('3. ✓ Domain field is properly emphasized as CRITICAL');
console.log('4. ✓ Domain examples are provided (google.com, microsoft.com)');
console.log('5. ✓ Domain is emphasized in final CRITICAL REMINDER');
