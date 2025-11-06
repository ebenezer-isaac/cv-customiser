/**
 * Test to verify that the LaTeX compilation fix works correctly
 * This tests that passing a string to latex() allows multiple passes
 */

const latex = require('node-latex');
const fs = require('fs').promises;

// Sample LaTeX document
const sampleLatex = `
\\documentclass{article}
\\begin{document}
\\section{Test Document}
This is a test document to verify LaTeX compilation.
\\end{document}
`;

async function testLatexCompilation() {
  console.log('Testing LaTeX compilation with string input...');
  console.log(`String length: ${sampleLatex.length} characters`);
  
  try {
    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      // Pass string directly (not stream) to allow multiple passes
      const output = latex(sampleLatex, {
        cmd: 'pdflatex',
        passes: 2 // This is what causes the "can't process stream twice" error with streams
      });
      
      output.on('data', (chunk) => chunks.push(chunk));
      output.on('end', () => resolve(Buffer.concat(chunks)));
      output.on('error', reject);
    });
    
    console.log('✓ LaTeX compilation successful!');
    console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
    return true;
  } catch (error) {
    console.error('✗ LaTeX compilation failed:', error.message);
    return false;
  }
}

// Run the test
testLatexCompilation()
  .then(success => {
    if (success) {
      console.log('\n✓ Test passed: String input to latex() works with multiple passes');
      process.exit(0);
    } else {
      console.log('\n✗ Test failed: Could not compile LaTeX');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
