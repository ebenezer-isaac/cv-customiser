const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * Generate CV content based on job details and context
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

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate cover letter content
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

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Generate cold email content
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

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Refine existing content based on feedback
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

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }
}

module.exports = AIService;
