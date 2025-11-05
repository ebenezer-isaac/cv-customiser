const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

class FileService {
  /**
   * Read file content based on file type
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} File content as text
   */
  async readFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
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
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  /**
   * Read LaTeX file
   * @param {string} filePath - Path to .tex file
   * @returns {Promise<string>} File content
   */
  async readTexFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  }

  /**
   * Read PDF file and extract text
   * @param {string} filePath - Path to .pdf file
   * @returns {Promise<string>} Extracted text
   */
  async readPdfFile(filePath) {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  /**
   * Read Word document and extract text
   * @param {string} filePath - Path to .doc or .docx file
   * @returns {Promise<string>} Extracted text
   */
  async readDocFile(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
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
