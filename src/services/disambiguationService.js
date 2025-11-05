/**
 * Disambiguation Service
 * Contains heuristics to select the best contact from a list of potential matches
 */

// Constants for email status
const EMAIL_STATUS = {
  VERIFIED: 'verified',
  GUESSED: 'guessed',
  UNAVAILABLE: 'unavailable'
};

class DisambiguationService {
  /**
   * Select the best contact from Apollo search results
   * Prioritizes contacts with verified emails and senior positions
   * @param {Array} contacts - Array of contact objects from Apollo
   * @returns {Object|null} Best contact or null if no suitable contact found
   */
  selectBestContact(contacts) {
    if (!contacts || contacts.length === 0) {
      return null;
    }

    // Single result - return it
    if (contacts.length === 1) {
      return contacts[0];
    }

    // Define seniority ranking (higher is better)
    const seniorityRank = {
      'c_suite': 5,
      'vp': 4,
      'director': 3,
      'manager': 2,
      'senior': 1,
      'entry': 0,
      'owner': 5,
      'partner': 5,
      'founder': 5
    };

    // Score each contact
    const scoredContacts = contacts.map(contact => {
      let score = 0;

      // Email status scoring (most important)
      if (contact.emailStatus === EMAIL_STATUS.VERIFIED) {
        score += 100;
      } else if (contact.emailStatus === EMAIL_STATUS.GUESSED && contact.email) {
        score += 50;
      } else if (contact.email) {
        score += 25;
      }

      // Seniority scoring
      const seniority = contact.seniority?.toLowerCase() || '';
      for (const [key, value] of Object.entries(seniorityRank)) {
        if (seniority.includes(key)) {
          score += value * 10;
          break;
        }
      }

      // Title-based scoring (looking for decision-makers)
      const title = contact.title?.toLowerCase() || '';
      if (title.includes('cto') || title.includes('chief technology')) {
        score += 20;
      } else if (title.includes('ceo') || title.includes('chief executive')) {
        score += 20;
      } else if (title.includes('head of') || title.includes('director')) {
        score += 15;
      } else if (title.includes('vp') || title.includes('vice president')) {
        score += 15;
      } else if (title.includes('lead') || title.includes('principal')) {
        score += 10;
      } else if (title.includes('senior') || title.includes('sr.')) {
        score += 5;
      }

      // Bonus for having LinkedIn URL
      if (contact.linkedinUrl) {
        score += 5;
      }

      return {
        contact,
        score
      };
    });

    // Sort by score (highest first)
    scoredContacts.sort((a, b) => b.score - a.score);

    // Return the best contact
    return scoredContacts[0].contact;
  }

  /**
   * Filter contacts to only include those with verified or guessed emails
   * @param {Array} contacts - Array of contact objects
   * @returns {Array} Filtered contacts
   */
  filterContactsWithEmails(contacts) {
    if (!contacts || contacts.length === 0) {
      return [];
    }

    const VALID_EMAIL_STATUSES = [EMAIL_STATUS.VERIFIED, EMAIL_STATUS.GUESSED];
    
    return contacts.filter(contact => {
      return contact.email && 
             VALID_EMAIL_STATUSES.includes(contact.emailStatus);
    });
  }

  /**
   * Validate that a contact has the minimum required information
   * @param {Object} contact - Contact object
   * @returns {boolean} True if contact is valid
   */
  isValidContact(contact) {
    return contact && 
           contact.name && 
           contact.email && 
           contact.title;
  }
}

module.exports = DisambiguationService;
