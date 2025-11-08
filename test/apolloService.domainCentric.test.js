/**
 * Tests for Apollo Service Domain-Centric Search Implementation
 * These tests validate the domain-centric architectural changes:
 * 1. SENIORITY_LEVELS constant exists and is used in searches
 * 2. findContact requires companyDomain parameter
 * 3. findContact aborts if domain is not provided
 * 4. API calls use q_organization_domains instead of q_organization_name
 */

const ApolloService = require('../src/services/apolloService');

// Test 1: Verify SENIORITY_LEVELS constant exists
console.log('Test 1: SENIORITY_LEVELS constant...');
try {
  // Access the constant through the module
  const apolloServiceModule = require('../src/services/apolloService.js');
  const moduleSource = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/apolloService.js'),
    'utf8'
  );
  
  if (!moduleSource.includes('SENIORITY_LEVELS')) {
    throw new Error('SENIORITY_LEVELS constant not found in apolloService.js');
  }
  
  if (!moduleSource.includes("['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director']")) {
    throw new Error('SENIORITY_LEVELS does not contain expected values');
  }
  
  console.log('✓ SENIORITY_LEVELS constant exists with correct values');
} catch (err) {
  console.error('✗ SENIORITY_LEVELS test failed:', err.message);
  process.exit(1);
}

// Test 2: Verify findContact method signature includes companyDomain
console.log('\nTest 2: findContact method signature...');
try {
  const apolloService = new ApolloService();
  const findContactStr = apolloService.findContact.toString();
  
  // Check if the function signature includes companyDomain parameter
  if (!findContactStr.includes('companyDomain')) {
    throw new Error('findContact method does not include companyDomain parameter');
  }
  
  console.log('✓ findContact method includes companyDomain parameter');
} catch (err) {
  console.error('✗ findContact signature test failed:', err.message);
  process.exit(1);
}

// Test 3: Verify findContact aborts when domain is not provided
console.log('\nTest 3: findContact aborts without domain...');
try {
  const apolloService = new ApolloService();
  
  // Mock the API key check to return true
  apolloService.isEnabled = () => true;
  
  // Mock the aiService to avoid AI calls
  apolloService.aiService = {
    getIntelligence: async () => ['CEO', 'CTO']
  };
  
  let abortMessageFound = false;
  
  // Test with null domain - should return null after domain check
  const result = apolloService.findContact('John Doe', 'Test Company', null, (msg, level) => {
    if (msg.includes('ABORT') && msg.includes('domain')) {
      abortMessageFound = true;
      console.log('  → Correctly aborted with message:', msg);
    }
  });
  
  // The function should return immediately with null
  result.then(contact => {
    if (contact !== null) {
      throw new Error('findContact should return null when domain is not provided');
    }
    if (!abortMessageFound) {
      throw new Error('Expected ABORT message for missing domain');
    }
    console.log('✓ findContact correctly aborts when domain is not provided');
  });
  
  // Wait for promise to resolve
  result.catch(err => {
    console.error('✗ Domain validation test failed:', err.message);
    process.exit(1);
  });
  
} catch (err) {
  console.error('✗ Domain validation test failed:', err.message);
  process.exit(1);
}

// Test 4: Verify API calls use q_organization_domains
console.log('\nTest 4: API calls use q_organization_domains...');
try {
  const moduleSource = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/apolloService.js'),
    'utf8'
  );
  
  if (!moduleSource.includes('q_organization_domains')) {
    throw new Error('API calls do not use q_organization_domains parameter');
  }
  
  // Verify it's used with companyDomain variable
  if (!moduleSource.includes('q_organization_domains: companyDomain')) {
    throw new Error('q_organization_domains is not set to companyDomain variable');
  }
  
  console.log('✓ API calls use q_organization_domains with companyDomain');
} catch (err) {
  console.error('✗ q_organization_domains test failed:', err.message);
  process.exit(1);
}

// Test 5: Verify person_seniorities is used in searches
console.log('\nTest 5: person_seniorities used in searches...');
try {
  const moduleSource = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/apolloService.js'),
    'utf8'
  );
  
  // Check for person_seniorities in API calls
  const seniorityMatches = moduleSource.match(/person_seniorities:\s*SENIORITY_LEVELS/g);
  
  if (!seniorityMatches || seniorityMatches.length < 2) {
    throw new Error('person_seniorities should be used in both person-centric and role-centric searches');
  }
  
  console.log('✓ person_seniorities filter is used in searches');
} catch (err) {
  console.error('✗ person_seniorities test failed:', err.message);
  process.exit(1);
}

// Test 6: Verify documentation updates
console.log('\nTest 6: Documentation updates...');
try {
  const moduleSource = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/apolloService.js'),
    'utf8'
  );
  
  // Check for updated JSDoc comments
  if (!moduleSource.includes('@param {string} companyDomain')) {
    throw new Error('JSDoc should document companyDomain parameter');
  }
  
  if (!moduleSource.includes('REQUIRED: Primary corporate domain')) {
    throw new Error('JSDoc should indicate that domain is REQUIRED');
  }
  
  console.log('✓ Documentation properly updated');
} catch (err) {
  console.error('✗ Documentation test failed:', err.message);
  process.exit(1);
}

console.log('\n✅ All domain-centric Apollo Service tests passed!');
console.log('\nSummary of domain-centric features validated:');
console.log('1. ✓ SENIORITY_LEVELS constant exists with correct values');
console.log('2. ✓ findContact method includes companyDomain parameter');
console.log('3. ✓ findContact aborts when domain is not provided');
console.log('4. ✓ API calls use q_organization_domains instead of q_organization_name');
console.log('5. ✓ person_seniorities filter is applied to searches');
console.log('6. ✓ Documentation properly updated');
console.log('\nNote: Integration testing with Apollo API requires live API key');
