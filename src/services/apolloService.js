const axios = require('axios');

/**
 * Apollo.io API Service
 * Manages interactions with Apollo.io People Search API
 * Requires APOLLO_API_KEY environment variable
 */
class ApolloService {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
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
   * Search for people at a specific company
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
            'Cache-Control': 'no-cache'
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
    if (!this.enabled) {
      throw new Error('Apollo.io integration is not enabled. Please set APOLLO_API_KEY in .env file.');
    }

    try {
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

      if (response.data && response.data.person) {
        const person = response.data.person;
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

      return null;
    } catch (error) {
      console.error('Apollo.io API error:', error.message);
      throw new Error(`Failed to get person from Apollo.io: ${error.message}`);
    }
  }
}

module.exports = ApolloService;
