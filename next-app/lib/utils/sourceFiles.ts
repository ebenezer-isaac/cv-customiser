import { FileService } from '../services/fileService';

const EXTENSIVE_CV_EXTENSIONS = ['.txt', '.doc', '.docx'];
const CV_STRATEGY_EXTENSIONS = ['.txt', '.pdf'];
const COVER_LETTER_STRATEGY_EXTENSIONS = ['.txt', '.pdf'];
const COLD_EMAIL_STRATEGY_EXTENSIONS = ['.txt', '.pdf'];

interface SourceFiles {
  originalCV: string;
  extensiveCV: string;
  cvStrategy: string;
  coverLetterStrategy: string;
  coldEmailStrategy: string;
}

/**
 * Load all source files for a user from Firebase Storage
 */
export async function loadSourceFiles(userId: string, fileService: FileService): Promise<SourceFiles> {
  try {
    const sourceFilesPrefix = `users/${userId}/source_files/`;
    
    // Check which files exist
    const files = await fileService.listFilesInStorage(sourceFilesPrefix);
    
    // Find original_cv.tex
    const originalCVPath = `${sourceFilesPrefix}original_cv.tex`;
    if (!files.includes(originalCVPath)) {
      throw new Error('original_cv.tex not found. Please upload your original CV first.');
    }
    
    // Find extensive_cv with any supported extension
    let extensiveCVPath: string | null = null;
    for (const ext of EXTENSIVE_CV_EXTENSIONS) {
      const path = `${sourceFilesPrefix}extensive_cv${ext}`;
      if (files.includes(path)) {
        extensiveCVPath = path;
        break;
      }
    }
    if (!extensiveCVPath) {
      throw new Error(`extensive_cv not found. Please upload your extensive CV (supported formats: ${EXTENSIVE_CV_EXTENSIONS.join(', ')})`);
    }
    
    // Find cv_strategy with any supported extension
    let cvStrategyPath: string | null = null;
    for (const ext of CV_STRATEGY_EXTENSIONS) {
      const path = `${sourceFilesPrefix}cv_strategy${ext}`;
      if (files.includes(path)) {
        cvStrategyPath = path;
        break;
      }
    }
    if (!cvStrategyPath) {
      throw new Error(`cv_strategy not found. Please upload your CV strategy document (supported formats: ${CV_STRATEGY_EXTENSIONS.join(', ')})`);
    }
    
    // Find cover_letter_strategy with any supported extension
    let coverLetterStrategyPath: string | null = null;
    for (const ext of COVER_LETTER_STRATEGY_EXTENSIONS) {
      const path = `${sourceFilesPrefix}cover_letter_strategy${ext}`;
      if (files.includes(path)) {
        coverLetterStrategyPath = path;
        break;
      }
    }
    if (!coverLetterStrategyPath) {
      throw new Error(`cover_letter_strategy not found. Please upload your cover letter strategy document (supported formats: ${COVER_LETTER_STRATEGY_EXTENSIONS.join(', ')})`);
    }
    
    // Find cold_email_strategy with any supported extension
    let coldEmailStrategyPath: string | null = null;
    for (const ext of COLD_EMAIL_STRATEGY_EXTENSIONS) {
      const path = `${sourceFilesPrefix}cold_email_strategy${ext}`;
      if (files.includes(path)) {
        coldEmailStrategyPath = path;
        break;
      }
    }
    if (!coldEmailStrategyPath) {
      throw new Error(`cold_email_strategy not found. Please upload your cold email strategy document (supported formats: ${COLD_EMAIL_STRATEGY_EXTENSIONS.join(', ')})`);
    }
    
    // Load all files in parallel
    const [originalCV, extensiveCV, cvStrategy, coverLetterStrategy, coldEmailStrategy] = await Promise.all([
      fileService.readFileFromStorage(originalCVPath),
      fileService.readFileFromStorage(extensiveCVPath),
      fileService.readFileFromStorage(cvStrategyPath),
      fileService.readFileFromStorage(coverLetterStrategyPath),
      fileService.readFileFromStorage(coldEmailStrategyPath)
    ]);
    
    return {
      originalCV,
      extensiveCV,
      cvStrategy,
      coverLetterStrategy,
      coldEmailStrategy
    };
  } catch (error: any) {
    console.error('Error loading source files:', error);
    throw new Error(`Failed to load source files: ${error.message}`);
  }
}
