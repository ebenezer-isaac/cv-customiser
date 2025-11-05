import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import validator from 'validator';

const fileService = new FileService();

// Maximum file size: 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024;

// Allowed file extensions
const ALLOWED_EXTENSIONS = {
  original_cv: ['.tex'],
  extensive_cv: ['.txt', '.doc', '.docx'],
  cv_strategy: ['.txt', '.pdf'],
  cover_letter_strategy: ['.txt', '.pdf'],
  cold_email_strategy: ['.txt', '.pdf']
};

/**
 * POST /api/upload-source-doc
 * Upload and replace source documents (original_cv.tex, extensive_cv, etc.)
 * Protected by Firebase authentication
 */
export const POST = withAuth(async (request: NextRequest, context: any, userId: string) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const docType = formData.get('docType') as string;
    
    // Validation 1: Check if file is present
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    // Validation 2: Check if docType is valid
    const validDocTypes = ['original_cv', 'extensive_cv', 'cv_strategy', 'cover_letter_strategy', 'cold_email_strategy'];
    if (!docType || !validDocTypes.includes(docType)) {
      return NextResponse.json(
        { error: `Invalid docType. Must be one of: ${validDocTypes.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validation 3: Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of 2MB. Uploaded file is ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      );
    }
    
    // Validation 4: Check file type
    const fileName = file.name;
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    const allowedExtensions = ALLOWED_EXTENSIONS[docType as keyof typeof ALLOWED_EXTENSIONS];
    
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: `Invalid file type for ${docType}. Allowed types: ${allowedExtensions.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Validation 5: Sanitize filename
    const sanitizedFileName = validator.escape(fileName);
    
    // Validation 6: Read file content and perform basic validation
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Check for null bytes (potential security issue)
    if (buffer.includes(0x00)) {
      return NextResponse.json(
        { error: 'File contains invalid null bytes' },
        { status: 400 }
      );
    }
    
    // For text-based files, check if they're actually text
    if (['.tex', '.txt'].includes(fileExtension)) {
      try {
        const content = buffer.toString('utf-8');
        // Check if content is valid UTF-8 by trying to parse it
        if (content.length === 0) {
          return NextResponse.json(
            { error: 'File is empty' },
            { status: 400 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: 'File is not valid UTF-8 text' },
          { status: 400 }
        );
      }
    }
    
    // Determine target filename and path in Firebase Storage
    let targetFilename: string;
    
    if (docType === 'original_cv') {
      targetFilename = 'original_cv.tex';
    } else if (docType === 'extensive_cv') {
      // Use the uploaded file's extension to preserve format
      targetFilename = `extensive_cv${fileExtension}`;
    } else if (docType === 'cv_strategy') {
      targetFilename = `cv_strategy${fileExtension}`;
    } else if (docType === 'cover_letter_strategy') {
      targetFilename = `cover_letter_strategy${fileExtension}`;
    } else if (docType === 'cold_email_strategy') {
      targetFilename = `cold_email_strategy${fileExtension}`;
    } else {
      return NextResponse.json(
        { error: 'Invalid docType' },
        { status: 400 }
      );
    }
    
    // User-specific storage path
    const storagePath = `users/${userId}/source_files/${targetFilename}`;
    
    // Upload to Firebase Storage
    await fileService.writeFileToStorage(storagePath, buffer);
    
    console.log(`✓ Uploaded ${docType} to ${storagePath}`);
    
    return NextResponse.json({
      success: true,
      message: `${docType} uploaded successfully`,
      filename: targetFilename,
      path: storagePath
    });
    
  } catch (error: any) {
    console.error('Error in /api/upload-source-doc:', error);
    return NextResponse.json(
      { error: 'Failed to upload source document', message: error.message },
      { status: 500 }
    );
  }
});
