const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mammoth = require('mammoth');

const execFileAsync = promisify(execFile);

class FileService {
  /**
   * Read file content based on file type
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} File content as text
   */
  async readFile(filePath) {
    console.log(`[DEBUG] FileService: Reading file: ${filePath}`);
    const ext = path.extname(filePath).toLowerCase();
    console.log(`[DEBUG] FileService: File extension: ${ext}`);
    
    switch (ext) {
      case '.tex':
        return await this.readTexFile(filePath);
      case '.pdf':
        return await this.readPdfFile(filePath);
      case '.doc':
      case '.docx':
        return await this.readDocFile(filePath);
      case '.txt':
        return await this.readTextFile(filePath);
      default:
        console.error(`[DEBUG] FileService: Unsupported file type: ${ext}`);
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  /**
   * Read LaTeX file
   * @param {string} filePath - Path to .tex file
   * @returns {Promise<string>} File content
   */
  async readTexFile(filePath) {
    console.log(`[DEBUG] FileService: Reading .tex file: ${filePath}`);
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`[DEBUG] FileService: Read ${content.length} characters from .tex file`);
    return content;
  }

  /**
   * Read PDF file and extract text using pdftotext (Poppler)
   * @param {string} filePath - Path to .pdf file
   * @returns {Promise<string>} Extracted text
   */
  async readPdfFile(filePath) {
    console.log(`[DEBUG] FileService: Reading .pdf file: ${filePath}`);
    try {
      // Use pdftotext from Poppler to extract text from PDF
      // The '-' argument tells pdftotext to output to stdout
      console.log('[DEBUG] FileService: Executing pdftotext command');
      const { stdout } = await execFileAsync('pdftotext', [filePath, '-']);
      console.log(`[DEBUG] FileService: Extracted ${stdout.length} characters from PDF`);
      return stdout;
    } catch (error) {
      // Check if it's a "command not found" error
      if (error.code === 'ENOENT') {
        console.error('[DEBUG] FileService: pdftotext command not found:', error);
        console.error('Error: pdftotext command not found.');
        console.error('Please install Poppler utilities:');
        console.error('  - Ubuntu/Debian: sudo apt-get install poppler-utils');
        console.error('  - macOS: brew install poppler');
        console.error('  - Windows: Download from https://blog.alivate.com.au/poppler-windows/');
        throw new Error('pdftotext is not installed. Please install Poppler utilities and ensure pdftotext is in your system PATH.');
      }
      
      // For any other error (e.g., invalid PDF), treat as empty and continue
      console.error(`[DEBUG] FileService: Failed to parse PDF file:`, error);
      console.warn(`Warning: Failed to parse PDF file ${filePath}: ${error.message}`);
      console.warn('Treating file content as empty string and continuing...');
      return '';
    }
  }

  /**
   * Read Word document and extract text
   * @param {string} filePath - Path to .doc or .docx file
   * @returns {Promise<string>} Extracted text
   */
  async readDocFile(filePath) {
    console.log(`[DEBUG] FileService: Reading Word document: ${filePath}`);
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      console.log(`[DEBUG] FileService: Extracted ${result.value.length} characters from Word document`);
      return result.value;
    } catch (error) {
      console.warn(`Warning: Failed to parse .doc file ${filePath}: ${error.message}`);
      console.warn('The file may be empty, corrupted, or not a valid Word document.');
      console.warn('Treating file content as empty string and continuing...');
      return '';
    }
  }

  /**
   * Read plain text file
   * @param {string} filePath - Path to .txt file
   * @returns {Promise<string>} File content
   */
  async readTextFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  }

  /**
   * Write content to file
   * @param {string} filePath - Path to write file
   * @param {string} content - Content to write
   */
  async writeFile(filePath, content) {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path
   */
  async ensureDirectory(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path to check
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read JSON file
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Object>} Parsed JSON object
   */
  async readJsonFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write JSON file
   * @param {string} filePath - Path to write JSON file
   * @param {Object} data - Data to write
   */
  async writeJsonFile(filePath, data) {
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * List files in directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<string[]>} Array of file names
   */
  async listFiles(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Get file stats
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File stats
   */
  async getFileStats(filePath) {
    return await fs.stat(filePath);
  }
}

module.exports = FileService;
