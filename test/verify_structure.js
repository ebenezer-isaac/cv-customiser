const fs = require('fs');

console.log('Testing AIService structure...');
const aiServiceCode = fs.readFileSync('src/services/aiService.js', 'utf-8');

// Check for JSON Mode configuration
if (aiServiceCode.includes('responseMimeType: "application/json"')) {
  console.log('✓ JSON Mode configuration present');
} else {
  console.log('✗ JSON Mode configuration missing');
}

// Check for generateJsonWithRetry method
if (aiServiceCode.includes('async generateJsonWithRetry')) {
  console.log('✓ generateJsonWithRetry method exists');
} else {
  console.log('✗ generateJsonWithRetry method missing');
}

// Count JSON methods that should be updated
const jsonMethods = [
  'extractJobDetails',
  'generateCompanyProfile', 
  'parseColdOutreachInput',
  'processJobURL',
  'processJobText',
  'researchCompanyAndIdentifyPeople'
];

let updatedCount = 0;
jsonMethods.forEach(method => {
  const regex = new RegExp(`async ${method}[^{]*{[^}]*generateJsonWithRetry`, 's');
  if (regex.test(aiServiceCode)) {
    updatedCount++;
    console.log(`  ✓ ${method} uses generateJsonWithRetry`);
  } else {
    console.log(`  ✗ ${method} doesn't use generateJsonWithRetry`);
  }
});

console.log(`\n${updatedCount}/${jsonMethods.length} JSON methods updated`);
console.log('Structure verification complete!');
