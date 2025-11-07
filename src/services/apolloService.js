const axios = require('axios');
const config = require('../config');

// Constants
const BASE_URL = 'https://api.apollo.io/v1';

/**
 * ApolloService
 * Service for interacting with the Apollo.io API
 */
class ApolloService {
  constructor() {
    this.apiKey = config.apiKeys.apollo;
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
      const person = await this.getPerson(contactId);
      if (person && person.email) {
        return person;
      }
      const response = await this.axiosInstance.post('/people/enrich', { id: contactId });
      return response.data.person;

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