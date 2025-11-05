import { adminStorage } from '../firebase-admin';
import { exec as execCallback, execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import mammoth from 'mammoth';

const exec = promisify(execCallback);
const execFile = promisify(execFileCallback);

export class FileService {
  /**
   * Read file content from Firebase Storage
   * @param filePath - Path in Firebase Storage (e.g., users/{userId}/source_files/original_cv.tex)
   * @returns File content as text
   */
  async readFileFromStorage(filePath: string): Promise<string> {
    try {
      const bucket = adminStorage().bucket();
      const file = bucket.file(filePath);
      
      const [buffer] = await file.download();
      
      // Determine file type from extension
      const ext = this.getFileExtension(filePath);
      
      switch (ext) {
        case '.tex':
        case '.txt':
          return buffer.toString('utf-8');
        case '.pdf':
          return await this.readPdfFromBuffer(buffer);
        case '.doc':
        case '.docx':
          return await this.readDocFromBuffer(buffer);
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error: any) {
      console.error(`Error reading file from storage: ${filePath}`, error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write file content to Firebase Storage
   * @param filePath - Path in Firebase Storage
   * @param content - Content to write
   */
  async writeFileToStorage(filePath: string, content: string | Buffer): Promise<void> {
    try {
      const bucket = adminStorage().bucket();
      const file = bucket.file(filePath);
      
      await file.save(content, {
        metadata: {
          contentType: this.getContentType(filePath),
        },
      });
    } catch (error: any) {
      console.error(`Error writing file to storage: ${filePath}`, error);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Check if file exists in Firebase Storage
   * @param filePath - Path in Firebase Storage
   * @returns True if file exists
   */
  async fileExistsInStorage(filePath: string): Promise<boolean> {
    try {
      const bucket = adminStorage().bucket();
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * List files in a Firebase Storage directory
   * @param prefix - Directory prefix (e.g., users/{userId}/sessions/)
   * @returns Array of file paths
   */
  async listFilesInStorage(prefix: string): Promise<string[]> {
    try {
      const bucket = adminStorage().bucket();
      const [files] = await bucket.getFiles({ prefix });
      return files.map(file => file.name);
    } catch (error) {
      console.error(`Error listing files in storage: ${prefix}`, error);
      return [];
    }
  }

  /**
   * Delete file from Firebase Storage
   * @param filePath - Path in Firebase Storage
   */
  async deleteFileFromStorage(filePath: string): Promise<void> {
    try {
      const bucket = adminStorage().bucket();
      const file = bucket.file(filePath);
      await file.delete();
    } catch (error: any) {
      console.error(`Error deleting file from storage: ${filePath}`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get signed URL for file download
   * @param filePath - Path in Firebase Storage
   * @param expiresInMinutes - URL expiration time in minutes
   * @returns Signed URL
   */
  async getSignedUrl(filePath: string, expiresInMinutes: number = 15): Promise<string> {
    try {
      const bucket = adminStorage().bucket();
      const file = bucket.file(filePath);
      
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresInMinutes * 60 * 1000,
      });
      
      return url;
    } catch (error: any) {
      console.error(`Error generating signed URL: ${filePath}`, error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Read PDF file and extract text using pdftotext (Poppler)
   */
  private async readPdfFromBuffer(buffer: Buffer): Promise<string> {
    try {
      // Write buffer to temporary file
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp_${Date.now()}.pdf`);
      
      await fs.writeFile(tempFile, buffer);
      
      try {
        // Use pdftotext from Poppler to extract text from PDF
        const { stdout } = await execFile('pdftotext', [tempFile, '-']);
        
        // Clean up temp file
        await fs.unlink(tempFile);
        
        return stdout;
      } catch (error) {
        // Clean up temp file
        await fs.unlink(tempFile);
        throw error;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.error('Error: pdftotext command not found.');
        throw new Error('pdftotext is not installed. Please install Poppler utilities.');
      }
      
      console.warn(`Warning: Failed to parse PDF: ${error.message}`);
      return '';
    }
  }

  /**
   * Read Word document from buffer and extract text
   */
  private async readDocFromBuffer(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error: any) {
      console.warn(`Warning: Failed to parse .doc file: ${error.message}`);
      return '';
    }
  }

  /**
   * Get file extension from path
   */
  private getFileExtension(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : '';
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filePath: string): string {
    const ext = this.getFileExtension(filePath);
    
    const contentTypes: { [key: string]: string } = {
      '.tex': 'text/x-tex',
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.json': 'application/json',
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Read file content from local filesystem (for temporary files)
   * @param filePath - Absolute local file path
   * @returns File content as text
   */
  async readLocalFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    const ext = this.getFileExtension(filePath);
    
    switch (ext) {
      case '.tex':
      case '.txt':
        return await fs.readFile(filePath, 'utf-8');
      case '.pdf':
        return await this.readPdfFile(filePath);
      case '.doc':
      case '.docx':
        return await this.readDocFile(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  /**
   * Write file content to local filesystem (for temporary files)
   */
  async writeLocalFile(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Read LaTeX file from local filesystem
   */
  private async readTexFile(filePath: string): Promise<string> {
    const fs = await import('fs/promises');
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Read PDF file from local filesystem and extract text
   */
  private async readPdfFile(filePath: string): Promise<string> {
    try {
      const { stdout } = await execFile('pdftotext', [filePath, '-']);
      return stdout;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.error('Error: pdftotext command not found.');
        throw new Error('pdftotext is not installed. Please install Poppler utilities.');
      }
      
      console.warn(`Warning: Failed to parse PDF file ${filePath}: ${error.message}`);
      return '';
    }
  }

  /**
   * Read Word document from local filesystem and extract text
   */
  private async readDocFile(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error: any) {
      console.warn(`Warning: Failed to parse .doc file ${filePath}: ${error.message}`);
      return '';
    }
  }

  /**
   * Check if local file exists
   */
  async localFileExists(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure local directory exists
   */
  async ensureLocalDirectory(dirPath: string): Promise<void> {
    const fs = await import('fs/promises');
    await fs.mkdir(dirPath, { recursive: true });
  }
}
