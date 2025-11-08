/**
 * Tests for apiController.js domain-centric updates
 * Validates that handleColdOutreachPath properly extracts and uses the domain
 */

const fs = require('fs');
const path = require('path');

console.log('Test 1: Verify domain extraction from research results...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Check that domain is extracted from research.company_intelligence.domain
  if (!controllerContent.includes('research.company_intelligence.domain')) {
    throw new Error('Domain is not extracted from research.company_intelligence.domain');
  }
  
  // Check that companyDomain variable is created
  if (!controllerContent.includes('const companyDomain')) {
    throw new Error('companyDomain variable is not created');
  }
  
  console.log('✓ Domain is extracted from AI research results');
} catch (err) {
  console.error('✗ Domain extraction test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 2: Verify domain is logged...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Check that domain is logged after extraction
  if (!controllerContent.includes('Company domain identified')) {
    throw new Error('Domain identification is not logged');
  }
  
  // Check that warning is logged if domain is missing
  if (!controllerContent.includes('No company domain found')) {
    throw new Error('Missing domain warning is not logged');
  }
  
  console.log('✓ Domain extraction is properly logged');
} catch (err) {
  console.error('✗ Domain logging test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 3: Verify domain is passed to findContact...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Check that findContact is called with companyDomain
  if (!controllerContent.includes('apolloService.findContact(targetName, companyName, companyDomain')) {
    throw new Error('findContact is not called with companyDomain parameter');
  }
  
  console.log('✓ Domain is passed to apolloService.findContact');
} catch (err) {
  console.error('✗ Domain passing test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 4: Verify domain is used for generic email fallback...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Check that domain is used when generating generic email
  if (!controllerContent.includes('if (companyDomain)')) {
    throw new Error('Domain check is not performed for generic email');
  }
  
  // Check that info@domain format is used
  if (!controllerContent.includes('info@${companyDomain}')) {
    throw new Error('Domain is not used in info@domain format');
  }
  
  // Check that fallback still exists for when domain is not available
  if (!controllerContent.includes('sanitizedCompanyName')) {
    throw new Error('Fallback for missing domain is not present');
  }
  
  console.log('✓ Domain is used for generic email with proper fallback');
} catch (err) {
  console.error('✗ Generic email fallback test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 5: Verify email generation logs mention domain...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Check that domain-based email is logged
  if (!controllerContent.includes('domain-based email')) {
    throw new Error('Domain-based email usage is not logged');
  }
  
  // Check that fallback email is logged
  if (!controllerContent.includes('fallback email')) {
    throw new Error('Fallback email usage is not logged');
  }
  
  console.log('✓ Email generation properly logs domain usage');
} catch (err) {
  console.error('✗ Email logging test failed:', err.message);
  process.exit(1);
}

console.log('\nTest 6: Verify handleColdOutreachPath extracts domain early...');
try {
  const controllerPath = path.join(__dirname, '../src/controllers/apiController.js');
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');
  
  // Extract the handleColdOutreachPath function
  const functionStartIndex = controllerContent.indexOf('async function handleColdOutreachPath');
  const researchLineIndex = controllerContent.indexOf('const research = await generationService.researchCompanyAndIdentifyPeople', functionStartIndex);
  const domainExtractionIndex = controllerContent.indexOf('const companyDomain', functionStartIndex);
  
  if (functionStartIndex === -1 || researchLineIndex === -1 || domainExtractionIndex === -1) {
    throw new Error('Cannot locate function structure');
  }
  
  // Verify domain is extracted immediately after research
  if (domainExtractionIndex < researchLineIndex) {
    throw new Error('Domain should be extracted after research results');
  }
  
  // Verify it happens before Apollo search
  const apolloSearchIndex = controllerContent.indexOf('apolloService.findContact', functionStartIndex);
  if (domainExtractionIndex > apolloSearchIndex && apolloSearchIndex !== -1) {
    throw new Error('Domain should be extracted before Apollo search');
  }
  
  console.log('✓ Domain is extracted at the correct point in workflow');
} catch (err) {
  console.error('✗ Workflow order test failed:', err.message);
  process.exit(1);
}

console.log('\n✅ All apiController domain-centric tests passed!');
console.log('\nSummary of controller updates validated:');
console.log('1. ✓ Domain is extracted from AI research results');
console.log('2. ✓ Domain extraction is properly logged');
console.log('3. ✓ Domain is passed to apolloService.findContact');
console.log('4. ✓ Domain is used for generic email with proper fallback');
console.log('5. ✓ Email generation properly logs domain usage');
console.log('6. ✓ Domain is extracted at the correct point in workflow');
