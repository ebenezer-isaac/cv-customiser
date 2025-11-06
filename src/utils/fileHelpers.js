const path = require('path');

// Supported file extensions for extensive_cv
const EXTENSIVE_CV_EXTENSIONS = ['.txt', '.doc', '.docx'];

// Source files paths
const SOURCE_FILES = {
  originalCV: path.join(process.cwd(), 'source_files', 'original_cv.tex'),
  extensiveCV: path.join(process.cwd(), 'source_files', 'extensive_cv.txt'),
  cvStrategy: path.join(process.cwd(), 'source_files', 'cv_strat.txt'),
  coverLetterStrategy: path.join(process.cwd(), 'source_files', 'cover_letter.txt'),
  coldEmailStrategy: path.join(process.cwd(), 'source_files', 'cold_mail.txt')
};

/**
 * Load all source files
 * @param {Object} fileService - File service instance
 * @returns {Promise<Object>} Object containing all source file contents
 * @throws {Error} If source files cannot be loaded
 */
async function loadSourceFiles(fileService) {
  try {
    // For extensiveCV, check which file extension exists
    let extensiveCVPath = SOURCE_FILES.extensiveCV;
    
    for (const ext of EXTENSIVE_CV_EXTENSIONS) {
      const checkPath = path.join(process.cwd(), 'source_files', `extensive_cv${ext}`);
      if (await fileService.fileExists(checkPath)) {
        extensiveCVPath = checkPath;
        break;
      }
    }

    const [originalCV, extensiveCV, cvStrategy, coverLetterStrategy, coldEmailStrategy] = await Promise.all([
      fileService.readFile(SOURCE_FILES.originalCV),
      fileService.readFile(extensiveCVPath),
      fileService.readFile(SOURCE_FILES.cvStrategy),
      fileService.readFile(SOURCE_FILES.coverLetterStrategy),
      fileService.readFile(SOURCE_FILES.coldEmailStrategy)
    ]);

    return {
      originalCV,
      extensiveCV,
      cvStrategy,
      coverLetterStrategy,
      coldEmailStrategy
    };
  } catch (error) {
    console.error('Error loading source files:', error);
    throw new Error('Failed to load source files. Please ensure all source files exist in the source_files directory.');
  }
}

module.exports = {
  loadSourceFiles,
  EXTENSIVE_CV_EXTENSIONS,
  SOURCE_FILES
};
