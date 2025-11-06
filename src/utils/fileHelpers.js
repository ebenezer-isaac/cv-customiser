const path = require('path');

// Supported file extensions for extensive_cv
const EXTENSIVE_CV_EXTENSIONS = ['.txt', '.doc', '.docx'];

// Source files paths
const SOURCE_FILES = {
  originalCV: path.join(process.cwd(), 'source_files', 'original_cv.tex'),
  extensiveCV: path.join(process.cwd(), 'source_files', 'extensive_cv.txt'),
  cvStrategy: path.join(process.cwd(), 'source_files', 'cv_strat.txt'),
  coverLetterStrategy: path.join(process.cwd(), 'source_files', 'cover_letter.txt'),
  coldEmailStrategy: path.join(process.cwd(), 'source_files', 'cold_mail.txt'),
  reconStrategy: path.join(process.cwd(), 'source_files', 'recon_strat.txt')
};

/**
 * Load all source files
 * @param {Object} fileService - File service instance
 * @returns {Promise<Object>} Object containing all source file contents
 * @throws {Error} If source files cannot be loaded
 */
async function loadSourceFiles(fileService) {
  try {
    console.log('[DEBUG] Starting to load source files...');
    
    // For extensiveCV, check which file extension exists
    let extensiveCVPath = SOURCE_FILES.extensiveCV;
    
    for (const ext of EXTENSIVE_CV_EXTENSIONS) {
      const checkPath = path.join(process.cwd(), 'source_files', `extensive_cv${ext}`);
      if (await fileService.fileExists(checkPath)) {
        extensiveCVPath = checkPath;
        console.log(`[DEBUG] Found extensive CV with extension: ${ext}`);
        break;
      }
    }

    console.log('[DEBUG] Loading files in parallel...');
    
    // Load all files with individual error handling for better diagnostics
    const filePromises = {
      originalCV: fileService.readFile(SOURCE_FILES.originalCV).catch(err => { throw new Error(`Failed to load original_cv.tex: ${err.message}`); }),
      extensiveCV: fileService.readFile(extensiveCVPath).catch(err => { throw new Error(`Failed to load extensive_cv: ${err.message}`); }),
      cvStrategy: fileService.readFile(SOURCE_FILES.cvStrategy).catch(err => { throw new Error(`Failed to load cv_strat.txt: ${err.message}`); }),
      coverLetterStrategy: fileService.readFile(SOURCE_FILES.coverLetterStrategy).catch(err => { throw new Error(`Failed to load cover_letter.txt: ${err.message}`); }),
      coldEmailStrategy: fileService.readFile(SOURCE_FILES.coldEmailStrategy).catch(err => { throw new Error(`Failed to load cold_mail.txt: ${err.message}`); }),
      reconStrategy: fileService.readFile(SOURCE_FILES.reconStrategy).catch(err => { throw new Error(`Failed to load recon_strat.txt: ${err.message}`); })
    };
    
    const [originalCV, extensiveCV, cvStrategy, coverLetterStrategy, coldEmailStrategy, reconStrategy] = await Promise.all([
      filePromises.originalCV,
      filePromises.extensiveCV,
      filePromises.cvStrategy,
      filePromises.coverLetterStrategy,
      filePromises.coldEmailStrategy,
      filePromises.reconStrategy
    ]);

    console.log('[DEBUG] All source files loaded successfully:');
    console.log(`[DEBUG]   - original_cv.tex: ${originalCV.length} characters`);
    console.log(`[DEBUG]   - extensive_cv: ${extensiveCV.length} characters`);
    console.log(`[DEBUG]   - cv_strat.txt: ${cvStrategy.length} characters`);
    console.log(`[DEBUG]   - cover_letter.txt: ${coverLetterStrategy.length} characters`);
    console.log(`[DEBUG]   - cold_mail.txt: ${coldEmailStrategy.length} characters`);
    console.log(`[DEBUG]   - recon_strat.txt: ${reconStrategy.length} characters`);

    return {
      originalCV,
      extensiveCV,
      cvStrategy,
      coverLetterStrategy,
      coldEmailStrategy,
      reconStrategy
    };
  } catch (error) {
    console.error('[DEBUG] Error loading source files:', error);
    throw new Error('Failed to load source files. Please ensure all source files exist in the source_files directory.');
  }
}

module.exports = {
  loadSourceFiles,
  EXTENSIVE_CV_EXTENSIONS,
  SOURCE_FILES
};
