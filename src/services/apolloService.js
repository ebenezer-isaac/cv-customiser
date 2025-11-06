const axios = require('axios');
const config = require('../config');

/**
 * Apollo.io API Service
 * Manages interactions with Apollo.io People Search API
 * Requires APOLLO_API_KEY environment variable
 */
class ApolloService {
  constructor() {
    this.apiKey = config.apiKeys.apollo;
    this.baseUrl = 'https://api.apollo.io/v1';
    this.enabled = !!this.apiKey;
    
    if (!this.enabled) {
      console.warn('APOLLO_API_KEY not configured. Apollo integration disabled.');
    }
  }

  /**
   * Check if Apollo integration is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Step 1: Search for a company to get its verified Organization ID
   * @param {string} companyName - Company name to search
   * @returns {Promise<Object|null>} Organization object with id and name, or null if not found
   */
  async searchCompany(companyName) {
    console.log('[DEBUG] Apollo.io: Searching for company:', companyName);
    
    if (!this.enabled) {
      console.log('[DEBUG] Apollo.io: Service not enabled (no API key)');
      throw new Error('Apollo.io integration is not enabled. Please set APOLLO_API_KEY in .env file.');
    }

    try {
      console.log('[DEBUG] Apollo.io: Sending company search request to API');
      const response = await axios.post(
        `${this.baseUrl}/organizations/search`,
        {
          api_key: this.apiKey,
          q_organization_name: companyName,
          per_page: 1,
          page: 1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      console.log('[DEBUG] Apollo.io: Company search response received');
      
      if (response.data && response.data.organizations && response.data.organizations.length > 0) {
        const org = response.data.organizations[0];
        console.log(`[DEBUG] Apollo.io: Found company - ID: ${org.id}, Name: ${org.name}, Employees: ${org.estimated_num_employees}`);
        return {
          id: org.id,
          name: org.name,
          website: org.website_url,
          industry: org.industry,
          employeeCount: org.estimated_num_employees
        };
      }

      console.log('[DEBUG] Apollo.io: No company found in search results');
      return null;
    } catch (error) {
      console.error('[DEBUG] Apollo.io company search error:', error);
      console.error('Apollo.io company search error:', error.message);
      throw new Error(`Failed to search for company: ${error.message}`);
    }
  }

  /**
   * Step 2: Fetch employees at a specific company using verified Organization ID
   * @param {Object} params - Search parameters
   * @param {string} params.organizationId - Verified Apollo Organization ID
   * @param {Array<string>} params.targetTitles - Array of target job titles
   * @param {number} params.limit - Maximum number of results (default: 10)
   * @returns {Promise<Array>} Array of contact results
   */
  async fetchEmployeesByOrgId({ organizationId, targetTitles, limit = 10 }) {
    console.log(`[DEBUG] Apollo.io: Fetching employees for org ID: ${organizationId}`);
    console.log(`[DEBUG] Apollo.io: Target titles: ${targetTitles.join(', ')}, Limit: ${limit}`);
    
    if (!this.enabled) {
      console.log('[DEBUG] Apollo.io: Service not enabled (no API key)');
      throw new Error('Apollo.io integration is not enabled. Please set APOLLO_API_KEY in .env file.');
    }

    try {
      const requestData = {
        api_key: this.apiKey,
        organization_ids: [organizationId],
        person_titles: targetTitles,
        per_page: limit,
        page: 1
      };

      console.log('[DEBUG] Apollo.io: Sending employee search request to API');
      const response = await axios.post(
        `${this.baseUrl}/mixed_people/search`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'x-api-key': this.apiKey
          },
          timeout: 30000
        }
      );

      console.log('[DEBUG] Apollo.io: Employee search response received');
      
      if (response.data && response.data.people) {
        const contacts = response.data.people.map(person => ({
          id: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          title: person.title,
          email: person.email,
          emailStatus: person.email_status,
          linkedinUrl: person.linkedin_url,
          organization: person.organization_name,
          organizationId: person.organization_id,
          seniority: person.seniority,
          departments: person.departments || []
        }));
        console.log(`[DEBUG] Apollo.io: Found ${contacts.length} employee(s)`);
        return contacts;
      }

      console.log('[DEBUG] Apollo.io: No employees found in search results');
      return [];
    } catch (error) {
      console.error('[DEBUG] Apollo.io employee fetch error:', error);
      console.error('Apollo.io employee fetch error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        throw new Error(`Apollo.io API error: ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Failed to fetch employees: ${error.message}`);
    }
  }

  /**
   * Step 3: Enrich a specific contact with full details
   * @param {string} personId - Apollo person ID
   * @returns {Promise<Object>} Enriched person data
   */
  async enrichContact(personId) {
    console.log(`[DEBUG] Apollo.io: Enriching contact ID: ${personId}`);
    return await this.getPerson(personId);
  }

  /**
   * Legacy method: Search for people at a specific company (kept for backward compatibility)
   * NOTE: This uses the old single-step approach. For new code, use the 3-step workflow:
   * 1. searchCompany() -> 2. fetchEmployeesByOrgId() -> 3. enrichContact()
   * @param {Object} params - Search parameters
   * @param {string} params.companyName - Company name to search
   * @param {Array<string>} params.targetTitles - Array of target job titles (e.g., ['CTO', 'Head of Engineering'])
   * @param {number} params.limit - Maximum number of results (default: 10)
   * @returns {Promise<Array>} Array of contact results
   */
  async searchPeople({ companyName, targetTitles, limit = 10 }) {
    if (!this.enabled) {
      throw new Error('Apollo.io integration is not enabled. Please set APOLLO_API_KEY in .env file.');
    }

    try {
      // Build search query for Apollo.io People Search API
      const requestData = {
        api_key: this.apiKey,
        q_organization_name: companyName,
        person_titles: targetTitles,
        per_page: limit,
        page: 1
      };

      const response = await axios.post(
        `${this.baseUrl}/mixed_people/search`,
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'x-api-key': this.apiKey
          },
          timeout: 30000 // 30 second timeout
        }
      );

      if (response.data && response.data.people) {
        return response.data.people.map(person => ({
          id: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          title: person.title,
          email: person.email,
          emailStatus: person.email_status, // e.g., 'verified', 'guessed', 'unavailable'
          linkedinUrl: person.linkedin_url,
          organization: person.organization_name,
          organizationId: person.organization_id,
          seniority: person.seniority,
          departments: person.departments || []
        }));
      }

      return [];
    } catch (error) {
      console.error('Apollo.io API error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        throw new Error(`Apollo.io API error: ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Failed to search Apollo.io: ${error.message}`);
    }
  }

  /**
   * Get enriched person information by ID
   * @param {string} personId - Apollo person ID
   * @returns {Promise<Object>} Enriched person data
   */
  async getPerson(personId) {
    console.log(`[DEBUG] Apollo.io: Getting person details for ID: ${personId}`);
    
    if (!this.enabled) {
      console.log('[DEBUG] Apollo.io: Service not enabled (no API key)');
      throw new Error('Apollo.io integration is not enabled. Please set APOLLO_API_KEY in .env file.');
    }

    try {
      console.log('[DEBUG] Apollo.io: Sending person lookup request to API');
      const response = await axios.get(
        `${this.baseUrl}/people/match`,
        {
          params: {
            api_key: this.apiKey,
            id: personId
          },
          timeout: 30000
        }
      );

      console.log('[DEBUG] Apollo.io: Person lookup response received');
      
      if (response.data && response.data.person) {
        const person = response.data.person;
        console.log(`[DEBUG] Apollo.io: Person enriched - ${person.name} (${person.title}) at ${person.organization_name}`);
        return {
          id: person.id,
          name: person.name,
          firstName: person.first_name,
          lastName: person.last_name,
          title: person.title,
          email: person.email,
          emailStatus: person.email_status,
          linkedinUrl: person.linkedin_url,
          organization: person.organization_name,
          headline: person.headline,
          photoUrl: person.photo_url,
          city: person.city,
          state: person.state,
          country: person.country
        };
      }

      console.log('[DEBUG] Apollo.io: Person not found');
      return null;
    } catch (error) {
      console.error('[DEBUG] Apollo.io API error:', error);
      console.error('Apollo.io API error:', error.message);
      throw new Error(`Failed to get person from Apollo.io: ${error.message}`);
    }
  }
}

module.exports = ApolloService;
