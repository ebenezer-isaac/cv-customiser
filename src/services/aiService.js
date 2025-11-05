const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIFailureError = require('../errors/AIFailureError');

class AIService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    this.maxRetries = 3;
    this.initialRetryDelay = 1000; // 1 second
  }

  /**
   * Sleep for a given number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is a 503 Service Unavailable error
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is a 503 error
   */
  isServiceUnavailableError(error) {
    return (
      error.message?.includes('503') || 
      error.status === 503 ||
      error.code === 503 ||
      error.statusCode === 503
    );
  }

  /**
   * Core generate function with retry mechanism for 503 errors
   * @param {string} prompt - The prompt to send to the AI
   * @param {number} attemptNumber - Current attempt number (for logging)
   * @returns {Promise<string>} Generated content
   * @throws {AIFailureError} If all retries fail
   */
  async generateWithRetry(prompt, attemptNumber = 0) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        const isServiceUnavailable = this.isServiceUnavailableError(error);
        const isLastAttempt = attempt === this.maxRetries - 1;

        if (isServiceUnavailable && !isLastAttempt) {
          // Calculate exponential backoff delay
          const delay = this.initialRetryDelay * Math.pow(2, attempt);
          console.warn(`AI Service unavailable (503), retrying in ${delay}ms... (Attempt ${attempt + 1}/${this.maxRetries})`);
          await this.sleep(delay);
          continue;
        } else if (isLastAttempt) {
          // All retries exhausted
          throw new AIFailureError(
            `AI service failed after ${this.maxRetries} attempts: ${error.message}`,
            error,
            this.maxRetries
          );
        } else {
          // Different error, throw immediately
          throw error;
        }
      }
    }
  }

  /**
   * Extract job description content from raw HTML/scraped text
   * Intelligently extracts the actual job description from potentially noisy HTML content
   * @param {string} rawContent - Raw HTML or scraped content
   * @returns {Promise<string>} Cleaned job description
   */
  async extractJobDescriptionContent(rawContent) {
    const prompt = `You are a text extraction AI. Your task is to extract ONLY the job description content from the provided text, which may contain website navigation, headers, footers, and other irrelevant content.

Analyze the following text and extract ONLY the job description, requirements, responsibilities, and relevant job posting information. Remove all website navigation, menus, headers, footers, cookie notices, and other irrelevant content.

Text to analyze:
${rawContent.substring(0, 10000)} ${rawContent.length > 10000 ? '...(truncated)' : ''}

CRITICAL: Respond with ONLY the cleaned job description text. Do not add any commentary or explanation.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Extract company name and job title from job description
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Object>} Object with companyName and jobTitle
   */
  async extractJobDetails(jobDescription) {
    const prompt = `You are a text-parsing AI. Your sole function is to extract the company name and job title from a job description.

Analyze the following job description. Extract the company name and the exact job title.

CRITICAL: Respond only with a valid JSON object in the format {"companyName": "...", "jobTitle": "..."}. Do not add any other text or explanation.

Job Description:
${jobDescription}`;

    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to parse job details:', error);
      return {
        companyName: 'Unknown Company',
        jobTitle: 'Position'
      };
    }
  }

  /**
   * Extract email addresses from job description
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Array<string>>} Array of email addresses found
   */
  async extractEmailAddresses(jobDescription) {
    // Use regex to find email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = jobDescription.match(emailRegex) || [];
    
    // Remove duplicates and return
    return [...new Set(emails)];
  }

  /**
   * Generate CV content using sophisticated prompting strategy
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.originalCV - Content of original_cv.tex
   * @param {string} params.extensiveCV - Content of extensive_cv.doc
   * @param {string} params.cvStrategy - Content of cv_strat.pdf
   * @param {string} params.companyName - Extracted company name
   * @param {string} params.jobTitle - Extracted job title
   * @param {number} params.retryCount - Current retry count for page limit enforcement
   * @returns {Promise<string>} Generated CV LaTeX content
   */
  async generateCVAdvanced({ jobDescription, originalCV, extensiveCV, cvStrategy, companyName, jobTitle, retryCount = 0 }) {
    const prompt = `System: You are an expert career strategist and a senior LaTeX specialist. Your task is to surgically edit a 2-page original_cv.tex to align perfectly with a new job description, while maintaining the exact 2-page layout.

User: Here is my current 2-page CV as a .tex file:
[original_cv.tex]
${originalCV}

Here is my "master" CV with more projects and details:
[extensive_cv.doc]
${extensiveCV}

Here are my CV writing strategies:
[cv_strat.pdf]
${cvStrategy}

Here is the new Job Description I am targeting:
[job_description.txt]
Job Title: ${jobTitle}
Company: ${companyName}
${jobDescription}

Your Task: Follow these steps precisely:

1. Analyze: Read the [job_description.txt] to identify the top 5-7 most important keywords, skills, and qualifications (e.g., "Python," "Data Visualization," "stakeholder management").

2. Keyword Mirroring: Scan my [original_cv.tex]. Find sentences or bullet points that are similar to the job description but use different wording. Intelligently replace the existing keywords with the exact keywords from the job description to pass ATS scans (e.g., if my CV says "led a team" and the JD says "managed a squad," change it to "managed a squad").

3. Identify Weakest Points: Scan my [original_cv.tex] and identify the 2-3 bullet points or projects that are least relevant to the new [job_description.txt].

4. Find Best Replacements: Search my [extensive_cv.doc] for projects, skills, or achievements that are a perfect match for the job description but are not currently in my original_cv.tex.

5. Surgical Replacement: Replace the "Weakest Points" you identified in Step 3 with the "Best Replacements" you found in Step 4.

CRITICAL CONSTRAINTS:
- NO LAYOUT BREAKAGE: The final .tex file MUST compile to exactly two (2) pages, just like the original.
- WORD COUNT HEURISTIC: To ensure the layout is preserved, when you replace a bullet point (Step 5) or rephrase a sentence (Step 2), the new text MUST have a similar word count (approx. +/- 10%) to the text it is replacing. This is the most important rule.
- NO TRUNCATION: Do NOT simply delete content to make it shorter. Your job is to replace irrelevant content with more relevant content of a similar length.
- PRESERVE STRUCTURE: You MUST preserve the original LaTeX formatting, document class, packages, sections, and structure. Only edit the text content within the existing structure.

MOST CRITICAL CONSTRAINT:
 - DO NOT HALUCINATE OR ADD INFORMATION IN THE CV THAT IS NOT ALREADY IN THE MASTER CV. SYNONYMS ARE ALLOWED BUT NEW KEYWORDS WITH 0 CONTEXT ARE BANNED. 

Output: Respond with only the new, complete, and raw LaTeX code for the generated_cv.tex file. Do not add any commentary, explanation, or markdown formatting.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Fix CV page count issues
   * @param {Object} params - Fix parameters
   * @param {string} params.failedCV - The LaTeX code that produced wrong page count
   * @param {number} params.actualPageCount - The actual page count
   * @param {string} params.jobDescription - Job description for context
   * @returns {Promise<string>} Fixed CV LaTeX content
   */
  async fixCVPageCount({ failedCV, actualPageCount, jobDescription }) {
    const prompt = `System: You are a LaTeX editor. Your previous attempt to edit a CV failed a validation check.

User: Your previous .tex generation was compiled, and the resulting PDF was ${actualPageCount} pages long. This is an error. The output MUST be exactly 2 pages.

Here is the failed LaTeX code you generated:
[failed_cv.tex]
${failedCV}

Here is the original job description, for context:
[job_description.txt]
${jobDescription}

Your Task: You must edit the [failed_cv.tex] code to reduce its compiled length to exactly 2 pages.

CRITICAL CONSTRAINTS:
- Do NOT truncate the document. Do not just cut off the end.
- Be More Concise: You must strategically shorten the text throughout the document. Find long bullet points and make them more concise. Replace verbose phrases (e.g., "was responsible for the management of") with single words ("managed").
- Prioritize: While shortening, you must preserve the keywords and projects that are most relevant to the [job_description.txt]. Shorten the least relevant parts first.
- Preserve Structure: Do not change the LaTeX formatting, only the text content.

Output: Respond with only the new, revised, and complete LaTeX code.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate CV content based on job details and context (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - Existing CV context
   * @param {number} params.retryCount - Current retry count for page limit enforcement
   * @returns {Promise<string>} Generated CV LaTeX content
   */
  async generateCV({ jobDescription, companyInfo, cvContext, retryCount = 0 }) {
    const pageLimitWarning = retryCount > 0 
      ? `\n\nIMPORTANT: Previous attempt resulted in ${retryCount > 1 ? 'still too many' : 'too many'} pages. You MUST make the CV shorter to fit EXACTLY 2 pages. Remove less relevant content, reduce descriptions, and be more concise.`
      : '\n\nIMPORTANT: The CV MUST be EXACTLY 2 pages when compiled. Be concise and selective with content.';

    const prompt = `Generate a professional CV in LaTeX format tailored for the following job application.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Existing CV Context:
${cvContext}

${pageLimitWarning}

Requirements:
- Output ONLY valid LaTeX code (no markdown, no explanations)
- Use a professional CV template with clean formatting
- Tailor the content specifically to the job description
- Highlight relevant skills and experiences
- Keep it to EXACTLY 2 pages when compiled
- Include sections: Contact Info, Summary, Experience, Education, Skills
- Use \\documentclass{article} or similar
- Include necessary packages like geometry, enumitem, etc.

Return only the LaTeX code, starting with \\documentclass and ending with \\end{document}.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cover letter content with advanced prompting
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyName - Company name
   * @param {string} params.jobTitle - Job title
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coverLetterStrategy - Cover letter strategy content
   * @returns {Promise<string>} Generated cover letter text
   */
  async generateCoverLetterAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coverLetterStrategy }) {
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const prompt = `System: You are an expert career coach and professional writer.

User: Use the following documents to write a persuasive, professional, and concise one-page cover letter.

The Job Description: (For ${jobTitle} at ${companyName})
${jobDescription}

The Final Customized CV: (This is the only source of truth for my skills and achievements)
${validatedCVText}

Extensive CV Context: (Additional background information for reference)
${extensiveCV}

Cover Letter Strategies: (You must follow these rules)
${coverLetterStrategy}

Your Task:
1. Use the current date: ${currentDate} (NOT a placeholder like [Date]).
2. Address the letter to the "Hiring Manager" at ${companyName}.
3. Clearly state the role you are applying for (${jobTitle}).
4. Read the Job Description to find the 2-3 most critical requirements.
5. Read the Final Customized CV and pull specific, quantifiable achievements (e.g., "increased efficiency by 20%") that directly prove you meet those 2-3 requirements.
6. Incorporate the principles from the Cover Letter Strategies (e.g., tone, structure, call to action).

CRITICAL CONSTRAINTS:
- The entire letter MUST be concise and fit on a single page (approx. 300-400 words).
- Do not invent achievements. Only use information present in the Final Customized CV and Extensive CV Context.
- Use the actual date ${currentDate}, NOT a placeholder.

Output: Respond with only the raw text of the complete cover letter.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cover letter content (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - CV context
   * @returns {Promise<string>} Generated cover letter text
   */
  async generateCoverLetter({ jobDescription, companyInfo, cvContext }) {
    const prompt = `Generate a professional cover letter for the following job application.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Candidate Background (from CV):
${cvContext}

Requirements:
- Write a compelling, personalized cover letter
- Address why the candidate is a great fit for this specific role
- Highlight 2-3 key qualifications that match the job requirements
- Show enthusiasm for the company and role
- Keep it to one page (around 3-4 paragraphs)
- Use professional business letter format
- Include proper salutation and closing

Return the complete cover letter text.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cold email content with advanced prompting
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyName - Company name
   * @param {string} params.jobTitle - Job title
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated cold email text
   */
  async generateColdEmailAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = `System: You are a networking expert and copywriter specializing in high-converting cold emails.

User: Use the following documents to write a brief, professional, and effective cold email.

The Job Description: (For ${jobTitle} at ${companyName})
${jobDescription}

The Final Customized CV:
${validatedCVText}

Extensive CV Context: (Additional background information for reference)
${extensiveCV}

Cold Email Strategies:
${coldEmailStrategy}

Your Task:
1. Follow the Cold Email Strategies for tone, subject line, and structure.
2. Create a compelling "Subject:" line.
3. Briefly introduce me and state my interest in the ${jobTitle} role at ${companyName}.
4. Pick the single best achievement from the Final Customized CV that matches the Job Description and highlight it in one sentence.
5. End with a clear, low-friction call to action (e.g., "Are you open to a brief 10-minute call next week?").

CRITICAL CONSTRAINTS:
- The entire email (including the subject) MUST be extremely short and scannable (under 150 words).

Output: Respond with only the raw text of the complete cold email, starting with "Subject: ".`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cold email content (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - CV context
   * @returns {Promise<string>} Generated cold email text
   */
  async generateColdEmail({ jobDescription, companyInfo, cvContext }) {
    const prompt = `Generate a professional cold email for a job application/networking outreach.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Candidate Background (from CV):
${cvContext}

Requirements:
- Write a concise, engaging cold email (150-200 words)
- Capture attention in the subject line and opening
- Briefly mention 1-2 key qualifications
- Express genuine interest in the company/role
- Include a clear call-to-action
- Professional but personable tone
- Format with Subject line followed by email body

Return the complete email including subject line.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Refine existing content based on feedback with chat history
   * @param {Object} params - Refinement parameters
   * @param {string} params.content - Content to refine
   * @param {string} params.feedback - User feedback
   * @param {string} params.contentType - Type of content (cv, cover_letter, email)
   * @param {Array} params.chatHistory - Previous chat messages
   * @returns {Promise<string>} Refined content
   */
  async refineContentAdvanced({ content, feedback, contentType, chatHistory = [] }) {
    const chatHistoryText = chatHistory.length > 0 
      ? JSON.stringify(chatHistory.slice(-5), null, 2)
      : 'No previous chat history';

    const prompt = `System: You are a helpful AI assistant. You are in a conversation with a user about a CV, cover letter, and cold email you just generated. The user now wants to make a refinement.

User: Here is our chat history so far:
[Chat_History_JSON]
${chatHistoryText}

Here is the full text of the document the user wants to edit:
[Document_To_Edit]
${content}

Here is the user's new instruction:
[User_Refinement_Request]
${feedback}

Your Task:
1. Read the User_Refinement_Request.
2. Apply that specific change to the Document_To_Edit.
3. Do not change any other part of the document.
4. If the request is for the .tex CV, you MUST still follow the word count heuristic: if you add a skill, you may need to slightly shorten another to maintain layout.

Output: Respond with only the new, complete, and raw text (or LaTeX code) for the entire updated document.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Refine existing content based on feedback (legacy method)
   * @param {Object} params - Refinement parameters
   * @param {string} params.content - Content to refine
   * @param {string} params.feedback - User feedback
   * @param {string} params.contentType - Type of content (cv, cover_letter, email)
   * @returns {Promise<string>} Refined content
   */
  async refineContent({ content, feedback, contentType }) {
    const prompt = `Refine the following ${contentType} based on user feedback.

Current Content:
${content}

User Feedback:
${feedback}

Requirements:
- Apply the user's feedback to improve the content
- Maintain the same format and structure
- Keep professional quality
${contentType === 'cv' ? '- Ensure it remains EXACTLY 2 pages when compiled' : ''}

Return the refined ${contentType}.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate AI-powered CV change summary
   * @param {Object} params - Parameters
   * @param {string} params.originalCV - Original CV .tex content
   * @param {string} params.newCV - New CV .tex content
   * @returns {Promise<string>} Bullet-pointed summary of changes
   */
  async generateCVChangeSummary({ originalCV, newCV }) {
    const prompt = `System: You are an expert document comparison analyst.

User: Compare the following two LaTeX CV documents and generate a concise, bullet-pointed summary of the key changes made.

Original CV:
${originalCV}

New CV:
${newCV}

Your Task:
1. Identify the major differences between the original and new CV
2. Focus on content changes, not just formatting
3. List specific projects, skills, or bullet points that were added, removed, or modified
4. Keep each bullet point concise and specific

CRITICAL CONSTRAINTS:
- Create a bullet-pointed list (using "•" or "-")
- Keep the summary under 10 bullet points
- Focus on the most significant changes
- Be specific about what was added, removed, or modified
- Do not include LaTeX code in the summary

Output: Respond with only the bullet-pointed change summary.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate a detailed company profile for cold outreach
   * @param {string} companyName - Name of the target company
   * @returns {Promise<Object>} Company profile with description and optional contact email
   */
  async generateCompanyProfile(companyName) {
    const prompt = `System: You are a company research AI. Your task is to create a detailed profile of a company for job application purposes.

User: Research and create a comprehensive profile for "${companyName}".

Your Task:
1. Provide a detailed description of the company including:
   - Industry and sector
   - Main products or services
   - Company size and notable achievements
   - Company culture and values
   - Recent news or developments (if known)
2. If possible, identify a general company contact email address (e.g., info@company.com, careers@company.com)

CRITICAL CONSTRAINTS:
- Base your response on your knowledge of the company
- If you don't have specific information, provide educated estimates based on the company name and industry
- Be factual and professional
- Keep the description concise but informative (200-300 words)
- Return a JSON object with the format: {"description": "...", "contactEmail": "email@company.com or null"}

Output: Respond with only a valid JSON object.`;

    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse company profile:', error);
      return {
        description: `${companyName} is a company in the technology industry.`,
        contactEmail: null
      };
    }
  }

  /**
   * Identify target personas/job titles at a company based on user's CV
   * @param {string} originalCV - User's CV content
   * @param {string} companyName - Target company name
   * @returns {Promise<Array<string>>} Array of target job titles
   */
  async findTargetPersonas({ originalCV, companyName }) {
    const prompt = `System: You are a career strategy AI. Your task is to analyze a user's CV and identify the most relevant job titles/personas to target at a company.

User: Here is my CV:
${originalCV.substring(0, 3000)} ${originalCV.length > 3000 ? '...(truncated)' : ''}

I want to do cold outreach to people at "${companyName}".

Your Task:
1. Analyze my CV to determine my professional domain and seniority level
2. Identify 3-5 specific job titles at ${companyName} that would be most relevant for me to contact
3. Focus on decision-makers and hiring managers (e.g., CTO, Head of Engineering, VP of Product, etc.)
4. Consider titles that are appropriate for my level and domain

CRITICAL CONSTRAINTS:
- Return a JSON array of job title strings
- Use specific titles like "CTO", "Head of Engineering", "VP of Product Development"
- Avoid generic titles like "Engineer" or "Manager"
- Order from most to least relevant
- Return exactly 3-5 titles

Output: Respond with only a valid JSON array, e.g., ["CTO", "Head of Engineering", "VP of Technology"]`;

    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse target personas:', error);
      return ['CTO', 'Head of Engineering', 'VP of Technology'];
    }
  }

  /**
   * Generate a hyper-personalized cold email with contact insights
   * @param {Object} params - Generation parameters
   * @param {string} params.companyName - Target company name
   * @param {string} params.companyProfile - Company profile description
   * @param {Object} params.contact - Contact information from Apollo
   * @param {string} params.validatedCVText - User's CV text
   * @param {string} params.extensiveCV - User's extensive CV
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated personalized cold email
   */
  async generatePersonalizedColdEmail({ 
    companyName, 
    companyProfile, 
    contact, 
    validatedCVText, 
    extensiveCV, 
    coldEmailStrategy 
  }) {
    const prompt = `System: You are an expert cold email writer specializing in hyper-personalized outreach.

User: I want to send a cold email to:
Name: ${contact.name}
Title: ${contact.title}
Company: ${companyName}
Email: ${contact.email}

Company Profile:
${companyProfile}

Here is my CV text:
${validatedCVText.substring(0, 2000)} ${validatedCVText.length > 2000 ? '...(truncated)' : ''}

Here is my master CV with more details:
${extensiveCV.substring(0, 2000)} ${extensiveCV.length > 2000 ? '...(truncated)' : ''}

Here are my cold email writing strategies:
${coldEmailStrategy}

Your Task:
1. Write a highly personalized cold email to ${contact.name}
2. Reference their specific role (${contact.title}) and how my background aligns with their team's needs
3. Mention something specific about ${companyName} that shows I've done my research
4. Include ONE standout achievement from my CV that's relevant to their role
5. Keep it brief, scannable, and action-oriented

CRITICAL CONSTRAINTS:
- Maximum 150 words (excluding subject line)
- Include a compelling subject line (5-7 words)
- Use a conversational but professional tone
- Address ${contact.name} directly
- Include a clear, low-friction call-to-action
- DO NOT use overly formal language or clichés
- Focus on value I can bring, not what I want

Format:
Subject: [Your subject line]

[Email body]

Output: Respond with the complete email including subject line.`;

    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate a generic cold email (fallback when no contact found)
   * @param {Object} params - Generation parameters
   * @param {string} params.companyName - Target company name
   * @param {string} params.companyProfile - Company profile description
   * @param {string} params.genericEmail - Generic company email address
   * @param {string} params.validatedCVText - User's CV text
   * @param {string} params.extensiveCV - User's extensive CV
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated generic cold email
   */
  async generateGenericColdEmail({ 
    companyName, 
    companyProfile, 
    genericEmail, 
    validatedCVText, 
    extensiveCV, 
    coldEmailStrategy 
  }) {
    const prompt = `System: You are an expert cold email writer specializing in compelling company outreach.

User: I want to send a cold email to ${companyName} at ${genericEmail}.

Company Profile:
${companyProfile}

Here is my CV text:
${validatedCVText.substring(0, 2000)} ${validatedCVText.length > 2000 ? '...(truncated)' : ''}

Here is my master CV with more details:
${extensiveCV.substring(0, 2000)} ${extensiveCV.length > 2000 ? '...(truncated)' : ''}

Here are my cold email writing strategies:
${coldEmailStrategy}

Your Task:
1. Write a professional cold email to ${companyName}'s hiring team
2. Express genuine interest in the company and mention something specific about them
3. Highlight ONE standout achievement from my CV that's relevant to their business
4. Keep it brief, scannable, and action-oriented

CRITICAL CONSTRAINTS:
- Maximum 150 words (excluding subject line)
- Include a compelling subject line (5-7 words)
- Use a conversational but professional tone
- Address the company/team (since we don't have a specific person)
- Include a clear, low-friction call-to-action
- DO NOT use overly formal language or clichés
- Focus on value I can bring, not what I want

Format:
Subject: [Your subject line]

[Email body]

Output: Respond with the complete email including subject line.`;

    return await this.generateWithRetry(prompt);
  }
}

module.exports = AIService;
