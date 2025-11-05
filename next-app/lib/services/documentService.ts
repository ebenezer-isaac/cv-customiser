import { exec as execCallback, execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import { FileService } from './fileService';
import { AIService } from './aiService';

const exec = promisify(execCallback);
const execFile = promisify(execFileCallback);

interface CompileResult {
  success: boolean;
  pageCount: number | null;
  pdfPath: string | null;
  message: string;
  error?: Error;
}

interface GenerateCVResult {
  success: boolean;
  cvContent: string;
  texPath: string;
  pdfPath: string | null;
  pageCount: number | null;
  attempts: number;
  error?: string;
}

interface GenerateCVParams {
  jobDescription: string;
  companyInfo: string;
  cvContext: string;
  outputDir: string;
}

interface GenerateCVAdvancedParams {
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  originalCV: string;
  extensiveCV: string;
  cvStrategy: string;
  outputDir: string;
  logCallback?: (message: string) => void;
}

interface JobInfo {
  companyName: string;
  jobTitle: string;
}

export class DocumentService {
  private fileService: FileService;
  private userName: string;

  constructor(fileService: FileService) {
    this.fileService = fileService;
    this.userName = process.env.USER_NAME || 'ebenezer-isaac';
  }

  /**
   * Compile LaTeX to PDF and validate page count
   */
  async compileLatexToPdf(texPath: string, outputDir: string, maxRetries: number = 3): Promise<CompileResult> {
    const path = await import('path');
    const fileName = path.basename(texPath, '.tex');
    const pdfPath = path.join(outputDir, `${fileName}.pdf`);
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Run pdflatex to compile the .tex file
        const command = `cd "${outputDir}" && pdflatex -interaction=nonstopmode "${texPath}"`;
        
        try {
          await exec(command);
        } catch (execError: any) {
          // pdflatex may return non-zero even on successful compilation
          // Check if PDF was generated
          const exists = await this.fileService.localFileExists(pdfPath);
          if (!exists) {
            throw new Error(`PDF compilation failed: ${execError.message}`);
          }
        }
        
        // Verify PDF was created
        const exists = await this.fileService.localFileExists(pdfPath);
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
      } catch (error: any) {
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
      error: lastError || undefined
    };
  }

  /**
   * Get PDF page count using pdfinfo (from Poppler)
   */
  async getPdfPageCount(pdfPath: string): Promise<number> {
    try {
      const { stdout } = await execFile('pdfinfo', [pdfPath]);
      
      // Parse the output to find the "Pages:" line
      const match = stdout.match(/Pages:\s+(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
      
      throw new Error('Could not determine page count from pdfinfo output');
    } catch (error: any) {
      console.error(`Error getting PDF page count: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text content from PDF using pdftotext (from Poppler)
   */
  async extractPdfText(pdfPath: string): Promise<string> {
    try {
      const { stdout } = await execFile('pdftotext', [pdfPath, '-']);
      return stdout;
    } catch (error: any) {
      console.error(`Error extracting PDF text: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate CV with automatic retry for page count validation
   */
  async generateCVWithRetry(aiService: AIService, params: GenerateCVParams): Promise<GenerateCVResult> {
    const { jobDescription, companyInfo, cvContext, outputDir } = params;
    const maxAttempts = 3;
    const path = await import('path');
    
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
      await this.fileService.writeLocalFile(texPath, cleanedContent);
      
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
    
    throw new Error('Unexpected error in generateCVWithRetry');
  }

  /**
   * Generate CV with advanced retry logic using source files
   */
  async generateCVWithAdvancedRetry(
    aiService: AIService,
    params: GenerateCVAdvancedParams
  ): Promise<GenerateCVResult> {
    const { jobDescription, companyName, jobTitle, originalCV, extensiveCV, cvStrategy, outputDir, logCallback } = params;
    const maxAttempts = 3;
    const path = await import('path');
    
    let lastCVContent: string | null = null;
    let lastPageCount: number | null = null;
    
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
      
      let cvContent: string;
      
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
          failedCV: lastCVContent!,
          actualPageCount: lastPageCount!,
          jobDescription
        });
      }
      
      // Clean LaTeX content
      const cleanedContent = this.cleanLatexContent(cvContent);
      lastCVContent = cleanedContent;
      
      // Write to .tex file with descriptive name
      const texPath = path.join(outputDir, texFilename);
      await this.fileService.writeLocalFile(texPath, cleanedContent);
      
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
    
    throw new Error('Unexpected error in generateCVWithAdvancedRetry');
  }

  /**
   * Clean LaTeX content by removing markdown code blocks
   */
  cleanLatexContent(content: string): string {
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
   */
  createDescriptiveFilename(params: {
    companyName: string;
    jobTitle: string;
    documentType: string;
    extension: string;
  }): string {
    const { companyName, jobTitle, documentType, extension } = params;
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Clean strings to be filename-safe
    const cleanCompany = companyName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    const cleanTitle = jobTitle.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
    
    return `${date}_${cleanCompany}_${cleanTitle}_${this.userName}_${documentType}.${extension}`;
  }

  /**
   * Save cover letter to file
   */
  async saveCoverLetter(content: string, outputDir: string, jobInfo: JobInfo): Promise<string> {
    const path = await import('path');
    
    // Require jobInfo for proper file naming
    if (!jobInfo || !jobInfo.companyName || !jobInfo.jobTitle) {
      throw new Error('jobInfo with companyName and jobTitle is required for descriptive file naming');
    }
    
    const filename = this.createDescriptiveFilename({
      companyName: jobInfo.companyName,
      jobTitle: jobInfo.jobTitle,
      documentType: 'CoverLetter',
      extension: 'txt'
    });
    
    const filePath = path.join(outputDir, filename);
    await this.fileService.writeLocalFile(filePath, content);
    return filePath;
  }

  /**
   * Save cold email to file
   */
  async saveColdEmail(content: string, outputDir: string, jobInfo: JobInfo): Promise<string> {
    const path = await import('path');
    
    // Require jobInfo for proper file naming
    if (!jobInfo || !jobInfo.companyName || !jobInfo.jobTitle) {
      throw new Error('jobInfo with companyName and jobTitle is required for descriptive file naming');
    }
    
    const filename = this.createDescriptiveFilename({
      companyName: jobInfo.companyName,
      jobTitle: jobInfo.jobTitle,
      documentType: 'ColdEmail',
      extension: 'txt'
    });
    
    const filePath = path.join(outputDir, filename);
    await this.fileService.writeLocalFile(filePath, content);
    return filePath;
  }
}
