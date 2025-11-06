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
    console.log(`[DEBUG] DisambiguationService: Selecting best contact from ${contacts?.length || 0} options`);
    
    if (!contacts || contacts.length === 0) {
      console.log('[DEBUG] DisambiguationService: No contacts to select from');
      return null;
    }

    // Single result - return it
    if (contacts.length === 1) {
      console.log(`[DEBUG] DisambiguationService: Only one contact, returning: ${contacts[0].name} (${contacts[0].title})`);
      return contacts[0];
    }

    console.log('[DEBUG] DisambiguationService: Multiple contacts, scoring each...');
    
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
      console.log(`[DEBUG] DisambiguationService: Scoring ${contact.name} (${contact.title})`);

      // Seniority scoring (NOW MOST IMPORTANT - prioritize role over email status)
      const seniority = contact.seniority?.toLowerCase() || '';
      for (const [key, value] of Object.entries(seniorityRank)) {
        if (seniority.includes(key)) {
          score += value * 20; // Doubled weight from 10 to 20
          break;
        }
      }

      // Title-based scoring (looking for decision-makers) - INCREASED WEIGHTS
      const title = contact.title?.toLowerCase() || '';
      if (title.includes('cto') || title.includes('chief technology')) {
        score += 50; // Increased from 20
      } else if (title.includes('ceo') || title.includes('chief executive')) {
        score += 50; // Increased from 20
      } else if (title.includes('head of') || title.includes('director')) {
        score += 40; // Increased from 15
      } else if (title.includes('vp') || title.includes('vice president')) {
        score += 40; // Increased from 15
      } else if (title.includes('lead') || title.includes('principal')) {
        score += 30; // Increased from 10
      } else if (title.includes('senior') || title.includes('sr.')) {
        score += 20; // Increased from 5
      }

      // Email status scoring (REDUCED - now secondary consideration)
      if (contact.emailStatus === EMAIL_STATUS.VERIFIED) {
        score += 30; // Reduced from 100
      } else if (contact.emailStatus === EMAIL_STATUS.GUESSED && contact.email) {
        score += 20; // Reduced from 50
      } else if (contact.email) {
        score += 10; // Reduced from 25
      }

      // Bonus for having LinkedIn URL
      if (contact.linkedinUrl) {
        score += 5;
      }

      console.log(`[DEBUG] DisambiguationService: ${contact.name} score: ${score}`);
      
      return {
        contact,
        score
      };
    });

    // Sort by score (highest first)
    scoredContacts.sort((a, b) => b.score - a.score);
    
    const bestContact = scoredContacts[0].contact;
    console.log(`[DEBUG] DisambiguationService: Best contact selected: ${bestContact.name} (${bestContact.title}) with score ${scoredContacts[0].score}`);

    // Return the best contact
    return bestContact;
  }

  /**
   * Filter contacts to only include those with verified or guessed emails
   * @param {Array} contacts - Array of contact objects
   * @returns {Array} Filtered contacts
   */
  filterContactsWithEmails(contacts) {
    console.log(`[DEBUG] DisambiguationService: Filtering ${contacts?.length || 0} contacts for valid emails`);
    
    if (!contacts || contacts.length === 0) {
      console.log('[DEBUG] DisambiguationService: No contacts to filter');
      return [];
    }

    const VALID_EMAIL_STATUSES = [EMAIL_STATUS.VERIFIED, EMAIL_STATUS.GUESSED];
    
    const filtered = contacts.filter(contact => {
      return contact.email && 
             VALID_EMAIL_STATUSES.includes(contact.emailStatus);
    });
    
    console.log(`[DEBUG] DisambiguationService: Filtered to ${filtered.length} contacts with valid emails`);
    return filtered;
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
