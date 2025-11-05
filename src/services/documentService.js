const { exec, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

class DocumentService {
  constructor(fileService) {
    this.fileService = fileService;
    this.userName = process.env.USER_NAME || 'ebenezer-isaac';
  }

  /**
   * Compile LaTeX to PDF and validate page count
   * @param {string} texPath - Path to .tex file
   * @param {string} outputDir - Output directory
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<Object>} Result object with success status and page count
   */
  async compileLatexToPdf(texPath, outputDir, maxRetries = 3) {
    const fileName = path.basename(texPath, '.tex');
    const pdfPath = path.join(outputDir, `${fileName}.pdf`);
    
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Run pdflatex to compile the .tex file
        const command = `cd "${outputDir}" && pdflatex -interaction=nonstopmode "${texPath}"`;
        
        try {
          await execAsync(command);
        } catch (execError) {
          // pdflatex may return non-zero even on successful compilation
          // Check if PDF was generated
          const exists = await this.fileService.fileExists(pdfPath);
          if (!exists) {
            throw new Error(`PDF compilation failed: ${execError.message}`);
          }
        }
        
        // Verify PDF was created
        const exists = await this.fileService.fileExists(pdfPath);
        if (!exists) {
          throw new Error('PDF file was not generated');
        }
        
        // Check page count
        const pageCount = await this.getPdfPageCount(pdfPath);
        
        if (pageCount === 2) {
          return {
            success: true,
            pageCount,
            pdfPath,
            message: 'PDF compiled successfully with exactly 2 pages'
          };
        } else {
          lastError = new Error(`PDF has ${pageCount} pages, expected exactly 2`);
          if (attempt < maxRetries - 1) {
            console.log(`Attempt ${attempt + 1}: Page count is ${pageCount}, retrying...`);
          }
        }
      } catch (error) {
        lastError = error;
        console.error(`Compilation attempt ${attempt + 1} failed:`, error.message);
      }
      
      // If not the last attempt, we'll retry
      if (attempt < maxRetries - 1) {
        continue;
      }
    }
    
    // All retries failed
    return {
      success: false,
      pageCount: null,
      pdfPath: null,
      message: `Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      error: lastError
    };
  }

  /**
   * Get PDF page count using pdfinfo (from Poppler)
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<number>} Number of pages
   */
  async getPdfPageCount(pdfPath) {
    try {
      // Use pdfinfo from Poppler to get page count
      const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
      
      // Parse the output to find the "Pages:" line
      const match = stdout.match(/Pages:\s+(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
      
      throw new Error('Could not determine page count from pdfinfo output');
    } catch (error) {
      console.error(`Error getting PDF page count: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text content from PDF using pdftotext (from Poppler)
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} Extracted text
   */
  async extractPdfText(pdfPath) {
    try {
      // Use pdftotext from Poppler to extract text from PDF
      const { stdout } = await execFileAsync('pdftotext', [pdfPath, '-']);
      return stdout;
    } catch (error) {
      console.error(`Error extracting PDF text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate CV with automatic retry for page count validation
   * @param {Object} aiService - AI service instance
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - CV context
   * @param {string} params.outputDir - Output directory
   * @returns {Promise<Object>} Generation result
   */
  async generateCVWithRetry(aiService, params) {
    const { jobDescription, companyInfo, cvContext, outputDir } = params;
    const maxAttempts = 3;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`\nCV Generation attempt ${attempt + 1}/${maxAttempts}...`);
      
      // Generate CV content with retry count for better prompting
      const cvContent = await aiService.generateCV({
        jobDescription,
        companyInfo,
        cvContext,
        retryCount: attempt
      });
      
      // Clean LaTeX content (remove markdown code blocks if present)
      const cleanedContent = this.cleanLatexContent(cvContent);
      
      // Write to .tex file
      const texPath = path.join(outputDir, 'cv.tex');
      await this.fileService.writeFile(texPath, cleanedContent);
      
      // Compile to PDF and validate
      const result = await this.compileLatexToPdf(texPath, outputDir, 1);
      
      if (result.success) {
        console.log(`✓ CV generated successfully with exactly 2 pages`);
        return {
          success: true,
          cvContent: cleanedContent,
          texPath,
          pdfPath: result.pdfPath,
          pageCount: result.pageCount,
          attempts: attempt + 1
        };
      } else {
        console.log(`✗ Attempt ${attempt + 1} failed: ${result.message}`);
        if (attempt === maxAttempts - 1) {
          // Last attempt failed, return the content anyway
          return {
            success: false,
            cvContent: cleanedContent,
            texPath,
            pdfPath: null,
            pageCount: result.pageCount,
            attempts: attempt + 1,
            error: `Failed to generate 2-page CV after ${maxAttempts} attempts`
          };
        }
      }
    }
  }

  /**
   * Generate CV with advanced retry logic using source files
   * @param {Object} aiService - AI service instance
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyName - Extracted company name
   * @param {string} params.jobTitle - Extracted job title
   * @param {string} params.originalCV - Content of original_cv.tex
   * @param {string} params.extensiveCV - Content of extensive_cv.doc
   * @param {string} params.cvStrategy - Content of cv_strat.pdf
   * @param {string} params.outputDir - Output directory
   * @param {Function} params.logCallback - Callback for logging
   * @returns {Promise<Object>} Generation result
   */
  async generateCVWithAdvancedRetry(aiService, params) {
    const { jobDescription, companyName, jobTitle, originalCV, extensiveCV, cvStrategy, outputDir, logCallback } = params;
    const maxAttempts = 3;
    
    let lastCVContent = null;
    let lastPageCount = null;
    
    // Create descriptive filename
    const texFilename = this.createDescriptiveFilename({
      companyName,
      jobTitle,
      documentType: 'CV',
      extension: 'tex'
    });
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      logCallback && logCallback(`CV Generation attempt ${attempt + 1}/${maxAttempts}...`);
      console.log(`\nCV Generation attempt ${attempt + 1}/${maxAttempts}...`);
      
      let cvContent;
      
      if (attempt === 0) {
        // First attempt: use advanced generation
        cvContent = await aiService.generateCVAdvanced({
          jobDescription,
          originalCV,
          extensiveCV,
          cvStrategy,
          companyName,
          jobTitle,
          retryCount: attempt
        });
      } else {
        // Subsequent attempts: use fix method
        cvContent = await aiService.fixCVPageCount({
          failedCV: lastCVContent,
          actualPageCount: lastPageCount,
          jobDescription
        });
      }
      
      // Clean LaTeX content
      const cleanedContent = this.cleanLatexContent(cvContent);
      lastCVContent = cleanedContent;
      
      // Write to .tex file with descriptive name
      const texPath = path.join(outputDir, texFilename);
      await this.fileService.writeFile(texPath, cleanedContent);
      
      // Compile to PDF and validate
      const result = await this.compileLatexToPdf(texPath, outputDir, 1);
      
      if (result.success && result.pageCount === 2) {
        logCallback && logCallback(`✓ CV generated successfully with exactly 2 pages`);
        console.log(`✓ CV generated successfully with exactly 2 pages`);
        return {
          success: true,
          cvContent: cleanedContent,
          texPath,
          pdfPath: result.pdfPath,
          pageCount: result.pageCount,
          attempts: attempt + 1
        };
      } else {
        lastPageCount = result.pageCount || 0;
        const message = `Attempt ${attempt + 1} failed: ${result.message}`;
        logCallback && logCallback(`✗ ${message}`);
        console.log(`✗ ${message}`);
        
        if (attempt === maxAttempts - 1) {
          // Last attempt failed, return the content anyway
          return {
            success: false,
            cvContent: cleanedContent,
            texPath,
            pdfPath: result.pdfPath,
            pageCount: lastPageCount,
            attempts: attempt + 1,
            error: `Failed to generate 2-page CV after ${maxAttempts} attempts. Final page count: ${lastPageCount}`
          };
        }
      }
    }
  }

  /**
   * Clean LaTeX content by removing markdown code blocks
   * @param {string} content - Raw content from AI
   * @returns {string} Cleaned LaTeX content
   */
  cleanLatexContent(content) {
    // Remove markdown code blocks (```latex, ```, etc.)
    let cleaned = content.replace(/```latex\n/g, '');
    cleaned = cleaned.replace(/```tex\n/g, '');
    cleaned = cleaned.replace(/```\n/g, '');
    cleaned = cleaned.replace(/```$/g, '');
    cleaned = cleaned.trim();
    
    return cleaned;
  }

  /**
   * Create descriptive filename using the format:
   * [YYYY-MM-DD]_[CompanyName]_[JobTitle]_[UserName]_[DocumentType].ext
   * @param {Object} params - Filename parameters
   * @param {string} params.companyName - Company name
   * @param {string} params.jobTitle - Job title
   * @param {string} params.documentType - Document type (CV, CoverLetter, ColdEmail)
   * @param {string} params.extension - File extension (e.g., 'pdf', 'tex', 'txt')
   * @returns {string} Formatted filename
   */
  createDescriptiveFilename({ companyName, jobTitle, documentType, extension }) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Clean strings to be filename-safe
    const cleanCompany = companyName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    const cleanTitle = jobTitle.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    
    return `${date}_${cleanCompany}_${cleanTitle}_${this.userName}_${documentType}.${extension}`;
  }

  /**
   * Save cover letter to file
   * @param {string} content - Cover letter content
   * @param {string} outputDir - Output directory
   * @param {Object} jobInfo - Job information for filename
   * @param {string} jobInfo.companyName - Company name
   * @param {string} jobInfo.jobTitle - Job title
   * @returns {Promise<string>} File path
   */
  async saveCoverLetter(content, outputDir, jobInfo = null) {
    let filename;
    if (jobInfo) {
      filename = this.createDescriptiveFilename({
        companyName: jobInfo.companyName,
        jobTitle: jobInfo.jobTitle,
        documentType: 'CoverLetter',
        extension: 'txt'
      });
    } else {
      filename = 'cover_letter.txt';
    }
    
    const filePath = path.join(outputDir, filename);
    await this.fileService.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Save cold email to file
   * @param {string} content - Cold email content
   * @param {string} outputDir - Output directory
   * @param {Object} jobInfo - Job information for filename
   * @param {string} jobInfo.companyName - Company name
   * @param {string} jobInfo.jobTitle - Job title
   * @returns {Promise<string>} File path
   */
  async saveColdEmail(content, outputDir, jobInfo = null) {
    let filename;
    if (jobInfo) {
      filename = this.createDescriptiveFilename({
        companyName: jobInfo.companyName,
        jobTitle: jobInfo.jobTitle,
        documentType: 'ColdEmail',
        extension: 'txt'
      });
    } else {
      filename = 'cold_email.txt';
    }
    
    const filePath = path.join(outputDir, filename);
    await this.fileService.writeFile(filePath, content);
    return filePath;
  }
}

module.exports = DocumentService;
