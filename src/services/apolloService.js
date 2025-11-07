const axios = require('axios');
const config = require('../config');

// Constants
const BASE_URL = 'https://api.apollo.io/v1';

// Configuration constants for Target Acquisition algorithm
const TARGET_ACQUISITION_CONFIG = {
  MAX_SEARCH_PAGES: 1, // Maximum pages to search in multi-pass (balance cost vs thoroughness)
  RESULTS_PER_PAGE: 25, // Results per page (Apollo API max is 25)
  SPAM_KEYWORDS: ['test', 'sample', 'demo', 'fake', 'example'], // Keywords indicating spam/test data
  FALLBACK_JOB_TITLES: ['CEO', 'CTO', 'VP of Engineering', 'Engineering Manager', 'Head of Engineering']
};

// Scoring constants for candidate evaluation
const SCORING = {
  EXACT_NAME_MATCH: 200, // NEW: Highest priority for exact name matches
  EXACT_COMPANY_MATCH: 300,
  KEYWORD_COMPANY_MATCH: 50,
  JOB_TITLE_MATCH: 30,
  VERIFIED_EMAIL: 20,
  GUESSED_EMAIL: 10,
  SPAM_PENALTY_PER_INDICATOR: 1000 // Points deducted per spam indicator (positive value)
};

// High-confidence threshold for person-centric search validation
// NOTE: Intentionally set to match EXACT_NAME_MATCH to ensure exact name matches always qualify
const HIGH_CONFIDENCE_SCORE_THRESHOLD = SCORING.EXACT_NAME_MATCH + SCORING.KEYWORD_COMPANY_MATCH; // 200 + 50 = 250/**

/**
 * ApolloService
 * Service for interacting with the Apollo.io API
 * Implements Target Acquisition algorithm for intelligent contact search
 */
class ApolloService {
  constructor(aiService = null) {
    this.apiKey = config.apiKeys.apollo;
    this.aiService = aiService;
    this.axiosInstance = axios.create({
      baseURL: BASE_URL,
      timeout: config.timeouts.scraping,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  isEnabled() {
    return !!this.apiKey;
  }

  /**
   * Calculate spam score for a candidate
   * @param {Object} candidate - Apollo candidate object
   * @returns {number} Spam score (0 = clean, higher = more suspicious)
   */
  /**
 * Calculate spam score for a candidate
 * @param {Object} candidate - Apollo candidate object
 * @returns {number} Spam score (0 = clean, higher = more suspicious)
 */
  calculateSpamScore(candidate) {
    console.log(`[DEBUG] ApolloService.calculateSpamScore: Evaluating ${candidate.name}`);
    let spamScore = 0; // This is a *counter* of spam indicators

    const candidateTitle = (candidate.title || '').toLowerCase().trim();
    const candidateCompany = (candidate.organization?.name || '').toLowerCase().trim();
    const candidateEmail = (candidate.email || '').toLowerCase();
    const candidateName = (candidate.name || '').toLowerCase();
    const employeeCount = candidate.organization?.estimated_num_employees;

    // 1. CRITICAL: Catch profiles where Title and Company are identical (like the "Sundar Pichai" junk)
    if (candidateTitle && candidateCompany && candidateTitle === candidateCompany && candidateTitle.length > 5) {
      console.log('[DEBUG] ApolloService.calculateSpamScore: SPAM (Title == Company)');
      spamScore += 1; // Add one spam indicator
    }

    // 2. CRITICAL: Catch fake companies with 0 employees (like the "Goku Saiyan" junk)
    // We check for "0" explicitly, as `null` or `undefined` might just mean "unknown"
    if (employeeCount === 0) {
      console.log('[DEBUG] ApolloService.calculateSpamScore: SPAM (0 Employees)');
      spamScore += 1;
    }

    // 3. Your existing checks for keywords
    for (const keyword of TARGET_ACQUISITION_CONFIG.SPAM_KEYWORDS) {
      if (candidateName.includes(keyword)) {
        console.log(`[DEBUG] ApolloService.calculateSpamScore: Found spam keyword "${keyword}" in name`);
        spamScore += 1;
      }
    }

    if (candidateEmail.includes('noreply') || candidateEmail.includes('no-reply')) {
      console.log(`[DEBUG] ApolloService.calculateSpamScore: Suspicious email pattern: ${candidateEmail}`);
      spamScore += 1;
    }

    // 4. Check for missing critical data
    if (!candidate.name || !candidate.title || !candidate.organization?.name) {
      console.log('[DEBUG] ApolloService.calculateSpamScore: SPAM (Missing critical data)');
      spamScore += 1;
    }

    // Return the *number* of indicators found.
    // Your SCORING.SPAM_PENALTY_PER_INDICATOR (1000) will do the rest.
    console.log(`[DEBUG] ApolloService.calculateSpamScore: Final spam score = ${spamScore}`);
    return spamScore;
  }
  /**
   * Build a precise regex for job title matching using word boundaries
   * @param {Array<string>} jobTitles - Array of job titles to match
   * @returns {RegExp|null} Regex with word boundaries or null if no titles
   * @private
   */
  _buildTitleRegex(jobTitles) {
    if (!jobTitles || jobTitles.length === 0) {
      return null;
    }

    // Escape special regex characters and create patterns for each title
    // Strategy: Match titles at the beginning of the string or after major delimiters
    // This prevents "President" from matching "Vice President" (Francis Desouza anomaly fix)
    // but allows "President" to match "President of Engineering"
    const escapedTitles = jobTitles.map(title => {
      // Escape special regex characters including hyphen
      const escaped = title.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

      // Match at start of string or after major delimiters (comma, semicolon, "and", "&")
      // Use lookahead for end boundary to handle both word chars and special chars
      return `(^|,\\s*|;\\s*|\\s+and\\s+|&\\s+)${escaped}(?=\\s|$|,|;|\\s+and\\s|&)`;
    });

    const pattern = `(${escapedTitles.join('|')})`;
    return new RegExp(pattern, 'i'); // Case-insensitive
  }

  /**
   * Score a candidate based on multiple criteria
   * @param {Object} candidate - Apollo candidate object
   * @param {string} companyName - Target company name
   * @param {Array<string>} likelyJobTitles - Likely job titles from AI
   * @param {string} targetPersonName - Target person name (optional, for exact name matching)
   * @returns {number} Total score
   */
  scoreCandidate(candidate, companyName, likelyJobTitles, targetPersonName = null) {
    console.log(`[DEBUG] ApolloService.scoreCandidate: Scoring ${candidate.name} (${candidate.title} at ${candidate.organization?.name})`);
    let score = 0;

    // NEW: Exact name match (highest priority)
    if (targetPersonName) {
      const candidateNameLower = (candidate.name || '').toLowerCase().trim();
      const targetNameLower = targetPersonName.toLowerCase().trim();

      if (candidateNameLower === targetNameLower) {
        console.log(`[DEBUG] ApolloService.scoreCandidate: EXACT name match (+${SCORING.EXACT_NAME_MATCH})`);
        score += SCORING.EXACT_NAME_MATCH;
      }
    }

    // Company name accuracy
    const candidateCompany = (candidate.organization?.name || '').toLowerCase();
    const targetCompany = companyName.toLowerCase();

    if (candidateCompany === targetCompany) {
      console.log(`[DEBUG] ApolloService.scoreCandidate: Exact company match (+${SCORING.EXACT_COMPANY_MATCH})`);
      score += SCORING.EXACT_COMPANY_MATCH;
    } else if (candidateCompany.includes(targetCompany) || targetCompany.includes(candidateCompany)) {
      console.log(`[DEBUG] ApolloService.scoreCandidate: Keyword company match (+${SCORING.KEYWORD_COMPANY_MATCH})`);
      score += SCORING.KEYWORD_COMPANY_MATCH;
    }

    // Job title match - use precise regex matching with word boundaries
    const candidateTitle = candidate.title || '';
    const titleRegex = this._buildTitleRegex(likelyJobTitles);

    if (titleRegex && titleRegex.test(candidateTitle)) {
      console.log(`[DEBUG] ApolloService.scoreCandidate: Job title match (+${SCORING.JOB_TITLE_MATCH})`);
      score += SCORING.JOB_TITLE_MATCH;
    }

    // Email quality
    const emailStatus = candidate.email_status || candidate.emailStatus;
    if (emailStatus === 'verified') {
      console.log(`[DEBUG] ApolloService.scoreCandidate: Verified email (+${SCORING.VERIFIED_EMAIL})`);
      score += SCORING.VERIFIED_EMAIL;
    } else if (emailStatus === 'guessed' || emailStatus === 'likely') {
      console.log(`[DEBUG] ApolloService.scoreCandidate: Guessed email (+${SCORING.GUESSED_EMAIL})`);
      score += SCORING.GUESSED_EMAIL;
    }

    // Anti-spam filter
    const spamScore = this.calculateSpamScore(candidate);
    if (spamScore > 0) {
      const penalty = SCORING.SPAM_PENALTY_PER_INDICATOR * spamScore;
      console.log(`[DEBUG] ApolloService.scoreCandidate: Applying spam penalty (-${penalty})`);
      score -= penalty; // Subtract the penalty
    }

    console.log(`[DEBUG] ApolloService.scoreCandidate: Final score = ${score}`);
    return score;
  }

  /**
   * TARGET ACQUISITION ALGORITHM - ENHANCED MULTI-STAGE VERSION
   * Intelligent, person-centric contact search with adaptive fallback strategy
   * 
   * STAGE 1: Person-Centric Search (High Precision)
   *   - Search by person name ONLY (no company constraint)
   *   - Score candidates with exact name match prioritization
   *   - Validate high-confidence match
   * 
   * STAGE 2: Role-Centric Fallback (High Recall)
   *   - Search by company + job titles
   *   - Find best contact filling relevant role
   * 
   * @param {string} personName - Name of the target person
   * @param {string} companyName - Name of the company
   * @param {Function} logCallback - Optional logging callback
   * @returns {Promise<Object|null>} Contact object with email or null
   */
  async findContact(personName, companyName, logCallback = null) {
    const log = (msg, level = 'info') => {
      console.log(`[DEBUG] ApolloService.findContact: ${msg}`);
      if (logCallback) logCallback(msg, level);
    };

    log(`Starting Enhanced Target Acquisition for ${personName} at ${companyName}`);

    if (!this.isEnabled()) {
      log('Apollo.io API key not configured', 'warning');
      return null;
    }

    try {
      // PHASE 1: INTELLIGENCE GATHERING
      log('Phase 1: Gathering intelligence on likely job titles...');
      let likelyJobTitles = [];

      if (this.aiService) {
        try {
          likelyJobTitles = await this.aiService.getIntelligence(personName, companyName);
          log(`✓ AI identified ${likelyJobTitles.length} likely job titles: ${likelyJobTitles.join(', ')}`, 'success');
        } catch (error) {
          console.error('[DEBUG] ApolloService.findContact: AI intelligence gathering failed:', error);
          log('⚠ AI intelligence gathering failed, using fallback titles', 'warning');
          likelyJobTitles = TARGET_ACQUISITION_CONFIG.FALLBACK_JOB_TITLES;
        }
      } else {
        log('⚠ No AI service available, using fallback titles', 'warning');
        likelyJobTitles = TARGET_ACQUISITION_CONFIG.FALLBACK_JOB_TITLES;
      }

      // PHASE 2: MULTI-PASS SEARCH (Build candidate pool using adaptive strategies)
      log('======================================');
      log('Phase 2: Multi-pass search with intelligent staging...');
      log('======================================');

      // STAGE 1 of Phase 2: Person-Centric Search (High Precision)
      log('STAGE 1: Person-Centric Search (High Precision)');
      log('Searching by person name ONLY (no company filter to avoid API quirks)...');

      const personCentricCandidates = [];
      const maxPages = TARGET_ACQUISITION_CONFIG.MAX_SEARCH_PAGES;

      for (let page = 1; page <= maxPages; page++) {
        log(`Person-centric search pass ${page}/${maxPages}...`);

        try {
          // CRITICAL: Search by q_keywords ONLY, without q_organization_name
          // This emulates Apollo UI's successful search strategy and ensures high-confidence candidates are retrieved
          const response = await this.axiosInstance.post('/mixed_people/search', {
            q_keywords: personName,
            page: page,
            per_page: TARGET_ACQUISITION_CONFIG.RESULTS_PER_PAGE
          });

          const candidates = response.data?.people || [];
          console.log(`[DEBUG] ApolloService.findContact: Person-centric page ${page} returned ${candidates.length} candidates`);

          if (candidates.length === 0) {
            log(`No more candidates found, stopping at page ${page}`);
            break;
          }
          console.log(candidates);
          personCentricCandidates.push(...candidates);
          log(`Added ${candidates.length} candidates (total: ${personCentricCandidates.length})`);

        } catch (error) {
          console.error(`[DEBUG] ApolloService.findContact: Person-centric search page ${page} failed:`, error);
          log(`⚠ Person-centric search pass ${page} failed: ${error.message}`, 'warning');
          break;
        }
      }

      // Evaluate person-centric results
      let highConfidenceMatch = null;
      if (personCentricCandidates.length > 0) {
        log(`✓ Person-centric search found ${personCentricCandidates.length} candidates`, 'success');

        // Score candidates with exact name match prioritization
        log('Scoring person-centric candidates with exact name match prioritization...');
        const scoredPersonCentricCandidates = personCentricCandidates.map(candidate => ({
          candidate,
          score: this.scoreCandidate(candidate, companyName, likelyJobTitles, personName)
        }));

        // Sort by score (highest first)
        scoredPersonCentricCandidates.sort((a, b) => b.score - a.score);

        const topCandidate = scoredPersonCentricCandidates[0];
        log(`Top person-centric candidate: ${topCandidate.candidate.name} at ${topCandidate.candidate.organization?.name} (score: ${topCandidate.score})`);

        // HIGH-CONFIDENCE VALIDATION
        if (topCandidate.score >= HIGH_CONFIDENCE_SCORE_THRESHOLD) {
          log(`✓ HIGH CONFIDENCE MATCH! Score ${topCandidate.score} >= threshold ${HIGH_CONFIDENCE_SCORE_THRESHOLD}`, 'success');
          highConfidenceMatch = topCandidate;
        } else {
          log(`⚠ Top person-centric score ${topCandidate.score} < threshold ${HIGH_CONFIDENCE_SCORE_THRESHOLD}`, 'warning');
          log('Person-centric search did not yield high-confidence match, will try role-centric fallback...');
        }
      } else {
        log('⚠ Person-centric search returned no candidates', 'warning');
      }

      // STAGE 2 of Phase 2: Role-Centric Fallback (High Recall) - only if no high-confidence match
      let roleCentricCandidates = [];

      if (!highConfidenceMatch) {
        log('STAGE 2: Role-Centric Fallback Search (High Recall)');
        log('Searching by company + job titles to find best contact for role...');

        for (let page = 1; page <= maxPages; page++) {
          log(`Role-centric search pass ${page}/${maxPages}...`);

          try {
            // ADAPTIVE QUERY: Use q_organization_name + person_titles (no person_names)
            // This finds the best contact filling the relevant role at the company
            const response = await this.axiosInstance.post('/mixed_people/search', {
              q_organization_name: companyName,
              person_titles: likelyJobTitles,
              page: page,
              per_page: TARGET_ACQUISITION_CONFIG.RESULTS_PER_PAGE
            });

            const candidates = response.data?.people || [];
            console.log(`[DEBUG] ApolloService.findContact: Role-centric page ${page} returned ${candidates.length} candidates`);

            if (candidates.length === 0) {
              log(`No more candidates found, stopping at page ${page}`);
              break;
            }

            roleCentricCandidates.push(...candidates);
            log(`Added ${candidates.length} candidates (total: ${roleCentricCandidates.length})`);

          } catch (error) {
            console.error(`[DEBUG] ApolloService.findContact: Role-centric search page ${page} failed:`, error);
            log(`⚠ Role-centric search pass ${page} failed: ${error.message}`, 'warning');
            break;
          }
        }

        if (roleCentricCandidates.length > 0) {
          log(`✓ Role-centric search found ${roleCentricCandidates.length} candidates`, 'success');
        } else {
          log('✗ Role-centric search returned no candidates', 'error');
        }
      }

      // Combine candidates: prioritize high-confidence match, then role-centric results
      // Note: high-confidence match already has a valid score, role-centric will be scored in Phase 3
      const allCandidates = highConfidenceMatch
        ? [{ ...highConfidenceMatch, alreadyScored: true }, ...roleCentricCandidates.map(c => ({ candidate: c, score: 0, alreadyScored: false }))]
        : roleCentricCandidates.map(c => ({ candidate: c, score: 0, alreadyScored: false }));

      if (allCandidates.length === 0) {
        log('✗ No candidates found in either person-centric or role-centric search', 'error');
        return null;
      }

      log(`✓ Built candidate pool of ${allCandidates.length} people`, 'success');

      // PHASE 3: CANDIDATE SCORING (for any candidates that don't already have scores)
      log('Phase 3: Scoring all candidates...');
      const scoredCandidates = allCandidates.map(item => {
        if (item.alreadyScored) {
          // Already scored (high-confidence person-centric match)
          return { candidate: item.candidate, score: item.score };
        } else {
          // Score role-centric candidates
          return {
            candidate: item.candidate,
            score: this.scoreCandidate(item.candidate, companyName, likelyJobTitles, personName)
          };
        }
      });

      // Sort by score (highest first)
      scoredCandidates.sort((a, b) => b.score - a.score);

      log(`Scored ${scoredCandidates.length} candidates. Top score: ${scoredCandidates[0].score}`);

      // PHASE 4: ITERATIVE ENRICHMENT (Most promising first)
      log('Phase 4: Iterative enrichment (spending credits on best candidates first)...');

      for (let i = 0; i < scoredCandidates.length; i++) {
        const { candidate, score } = scoredCandidates[i];
        log(`Attempting enrichment ${i + 1}/${scoredCandidates.length}: ${candidate.name} (score: ${score})`);

        const result = await this.tryEnrichCandidate(candidate, log);
        if (result) {
          log(`✓ Target acquired! ${result.name} at ${result.organization?.name}`, 'success');
          return result;
        }
      }

      log('✗ No contact found with email after enriching all candidates', 'error');
      return null;

    } catch (error) {
      console.error('[DEBUG] ApolloService.findContact: Target Acquisition failed:', error);
      log(`✗ Target Acquisition failed: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * Helper method to try enriching a candidate and return contact info if successful
   * @param {Object} candidate - Candidate object from Apollo search
   * @param {Function} log - Logging function
   * @returns {Promise<Object|null>} Contact object with email or null
   */
  async tryEnrichCandidate(candidate, log) {
    // Check if candidate already has email
    if (candidate.email && candidate.email !== 'email_not_unlocked@domain.com') {
      log(`✓ Candidate was already enriched (no credit spent): ${candidate.email}`, 'success');
      return {
        id: candidate.id,
        name: candidate.name,
        title: candidate.title,
        email: candidate.email,
        emailStatus: candidate.email_status || candidate.emailStatus,
        organization: candidate.organization
      };
    }

    // Try to enrich this candidate
    try {
      const enriched = await this.enrichContact(candidate.id);

      if (enriched && enriched.email) {
        log(`✓ Enrichment successful! Found email: ${enriched.email}`, 'success');
        return {
          id: enriched.id,
          name: enriched.name,
          title: enriched.title,
          email: enriched.email,
          emailStatus: enriched.email_status || enriched.emailStatus,
          organization: enriched.organization
        };
      }

      log(`⚠ Enrichment returned no email`);
      return null;

    } catch (error) {
      console.error(`[DEBUG] ApolloService.tryEnrichCandidate: Enrichment failed for ${candidate.name}:`, error);
      log(`✗ Enrichment failed for ${candidate.name}: ${error.message}`, 'error');
      return null;
    }
  }

  /**
   * DEFINITIVE FIX: Search for a company with intelligent, multi-step selection logic.
   * @param {string} companyName - Name of the company to search
   * @returns {Promise<Object|null>} Best matching company object or null if not found
   */
  async searchCompany(companyName) {
    console.log(`[DEBUG] Apollo.io: Intelligent search for company: ${companyName}`);
    try {
      const response = await this.axiosInstance.post('/mixed_companies/search', {
        q_organization_name: companyName
      });

      if (!response.data || !response.data.organizations || response.data.organizations.length === 0) {
        console.log('[DEBUG] Apollo.io: No company found in search results');
        return null;
      }

      let organizations = response.data.organizations;
      const lowerCaseCompanyName = companyName.toLowerCase();

      // Step 1: Prioritize an exact match (case-insensitive).
      const exactMatch = organizations.find(org => org.name.toLowerCase() === lowerCaseCompanyName);
      if (exactMatch) {
        console.log(`[DEBUG] Apollo.io: Found exact match: ${exactMatch.name}`);
        return exactMatch;
      }

      // Step 2: If no exact match, find all keyword matches (e.g., "Google" in "Google Cloud").
      const keywordMatches = organizations.filter(org => org.name.toLowerCase().includes(lowerCaseCompanyName));
      if (keywordMatches.length > 0) {
        // Step 3: Use employee count as a tie-breaker for keyword matches.
        keywordMatches.sort((a, b) => (b.estimated_num_employees || 0) - (a.estimated_num_employees || 0));
        const bestKeywordMatch = keywordMatches[0];
        console.log(`[DEBUG] Apollo.io: No exact match. Found best keyword match: ${bestKeywordMatch.name} with ${bestKeywordMatch.estimated_num_employees} employees.`);
        return bestKeywordMatch;
      }

      // Step 4: If no keyword matches, fall back to the original heuristic on all results.
      organizations.sort((a, b) => (b.estimated_num_employees || 0) - (a.estimated_num_employees || 0));
      const bestOverallMatch = organizations[0];
      console.log(`[DEBUG] Apollo.io: No exact or keyword match. Falling back to largest company: ${bestOverallMatch.name}`);
      return bestOverallMatch;

    } catch (error) {
      console.error('Apollo.io API error in searchCompany:', error);
      throw new Error(`Failed to search company on Apollo.io: ${error.message}`);
    }
  }

  /**
   * Fetch employees for a given organization ID
   * @param {Object} params - Parameters for fetching employees
   * @param {string} params.organizationId - Apollo organization ID
   * @param {Array<string>} params.targetTitles - List of target job titles
   * @param {number} params.limit - Max number of employees to fetch
   * @returns {Promise<Array<Object>>} List of employee objects
   */
  async fetchEmployeesByOrgId({ organizationId, targetTitles = [], limit = 10 }) {
    console.log(`[DEBUG] Apollo.io: Fetching employees for org ID: ${organizationId}`);
    try {
      const response = await this.axiosInstance.post('/mixed_people/search', {
        organization_ids: [organizationId],
        person_titles: targetTitles,
        page: 1,
        per_page: limit
      });

      const contacts = response.data.people || [];
      console.log(`[DEBUG] Apollo.io: Found ${contacts.length} employee(s)`);
      return contacts;

    } catch (error) {
      console.error('Apollo.io API error in fetchEmployeesByOrgId:', error);
      throw new Error(`Failed to fetch employees from Apollo.io: ${error.message}`);
    }
  }

  /**
   * Enrich a contact with full details (including email)
   * @param {string} contactId - Apollo person ID
   * @returns {Promise<Object|null>} Enriched contact object
   */
  async enrichContact(contactId) {
    console.log(`[DEBUG] Apollo.io: Enriching contact ID: ${contactId}`);
    try {
      // 1. Check if already unlocked (good credit-saving)
      const person = await this.getPerson(contactId);
      if (person && person.email) {
        console.log(`✓ Contact ${contactId} was already unlocked.`, 'success');
        return person;
      }

      // 2. If not, call POST /enrich to spend a credit
      console.log(`[DEBUG] Apollo.io: No local email found. Calling POST /people/enrich...`);
      const response = await this.axiosInstance.post('/people/enrich', { id: contactId });

      // 3. (NEW LOG) Log the *entire* person object returned by the API
      console.log('[DEBUG] Apollo.io: Full enrich API response:', response.data);

      const enrichedPerson = response.data.person;

      // 4. Check what the API gave you
      if (enrichedPerson && enrichedPerson.email) {
        return enrichedPerson; // Success!
      } else {
        // Log why it failed
        console.log(`[DEBUG] Apollo.io: Enrich call succeeded but response.data.person has no email.`);
        return enrichedPerson; // Return the empty object for tryEnrichCandidate to handle
      }

    } catch (error) {
      console.error('Apollo.io API error in enrichContact:', error);
      throw new Error(`Failed to enrich contact on Apollo.io: ${error.message}`);
    }
  }

  /**
   * Get full details for a person by their ID
   * @param {string} personId - Apollo person ID
   * @returns {Promise<Object|null>} Person object
   */
  async getPerson(personId) {
    console.log(`[DEBUG] Apollo.io: Getting person details for ID: ${personId}`);
    try {
      const response = await this.axiosInstance.get('/people/match', {
        params: { id: personId }
      });
      return response.data.person;

    } catch (error) {
      console.error('Apollo.io API error:', error.response ? error.response.data : error);
      throw new Error(`Failed to get person from Apollo.io: ${error.message}`);
    }
  }
}

module.exports = ApolloService;