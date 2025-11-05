# CV Customiser - Next.js Application

Modern, secure Next.js 14 application with Firebase Authentication and Storage for AI-powered CV customization.

## Features

- 🔐 **Firebase Authentication**: Google Sign-In and Email/Password
- ☁️ **Firebase Storage**: Secure, user-specific file storage
- 🤖 **AI-Powered Generation**: Uses Google Gemini for CV, cover letter, and cold email generation
- 📝 **LaTeX Compilation**: Server-side PDF generation from LaTeX
- 🔒 **Protected API Routes**: All endpoints secured with Firebase authentication
- 📱 **Responsive UI**: Built with Next.js 14 and Tailwind CSS
- 🗂️ **Session Management**: Track all generation history per user

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed information about the file storage and processing pipeline.

## Prerequisites

- Node.js 18+ and npm
- Firebase project with Authentication and Storage enabled
- Google Gemini API key
- LaTeX distribution (for PDF compilation):
  - **Ubuntu/Debian**: `sudo apt-get install texlive-latex-base texlive-latex-extra poppler-utils`
  - **macOS**: `brew install texlive poppler`
  - **Windows**: Install MiKTeX or TeX Live

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable Google and Email/Password providers
3. Enable Storage:
   - Go to Storage and click "Get Started"
   - Set security rules (see below)
4. Get your Firebase configuration:
   - Go to Project Settings > General
   - Find "Your apps" section
   - Copy Web API Key, Auth Domain, Project ID, Storage Bucket, etc.
5. Create a service account:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file securely

### 3. Set Up Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your credentials.

### 4. Configure Firebase Storage Security Rules

In Firebase Console > Storage > Rules, add:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

All API endpoints are protected by Firebase Authentication. See full documentation in the code.

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Authentication**: Firebase Authentication
- **Storage**: Firebase Storage
- **AI**: Google Gemini API
- **PDF Generation**: LaTeX (pdflatex)
- **Styling**: Tailwind CSS

## License

MIT
