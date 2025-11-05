# GDPR Compliance Summary

## Overview

CV Customiser has been designed with privacy-first principles and full GDPR compliance. We store and process the **absolute minimum** amount of user data necessary to provide the service.

## What We Store (Data Minimization)

### ✅ Essential Data Only

| Data Type | What We Store | Why | Retention |
|-----------|---------------|-----|-----------|
| **Authentication** | Email address, UID | Required for login and file access | Until account deletion |
| **Source Files** | CV templates, strategy docs | Core functionality | User-controlled |
| **Generated Docs** | Customized CVs, letters | Service output | User-controlled |
| **Session Metadata** | Company, job title, timestamps | File naming, history | User-controlled |

### ❌ What We Don't Store

- ❌ **No IP addresses** - Not logged or stored
- ❌ **No analytics/tracking** - No Google Analytics, no pixels
- ❌ **No usage data** - Don't track what you do
- ❌ **No job description analysis** - Only used for generation, not stored long-term
- ❌ **No personal data extraction** - Don't parse or store info from your CV
- ❌ **No cookies** - Only essential Firebase Auth tokens
- ❌ **No third-party sharing** - Data stays with Firebase/Google only

## GDPR Rights Implementation

### 1. Right to Access

**How to access your data:**
```bash
# Via UI: Settings > View My Data
# Via API:
GET /api/history
Authorization: Bearer {your_firebase_token}
```

You can view all your sessions and files anytime.

### 2. Right to Data Portability (Export)

**How to export all your data:**
```bash
# Via UI: Settings > Export My Data
# Via API:
GET /api/user/export-data
Authorization: Bearer {your_firebase_token}
```

Downloads a complete JSON file containing:
- User profile
- All source files
- All sessions with generated documents
- Complete chat history

**Format**: Standard JSON (machine-readable and portable)

### 3. Right to Erasure (Delete Account)

**How to delete your account:**
```bash
# Via UI: Settings > Delete Account (with confirmation)
# Via API:
DELETE /api/user/delete-account
Authorization: Bearer {your_firebase_token}
Body: { "confirm": true }
```

**What gets deleted:**
- ✅ Firebase Authentication account
- ✅ All source files
- ✅ All sessions and generated documents
- ✅ All chat history
- ✅ All metadata

**This is permanent and irreversible.**

### 4. Right to Rectification (Update Data)

**How to update your files:**
```bash
# Via UI: Settings > Upload Files (replaces existing)
# Via API:
POST /api/upload-source-doc
Authorization: Bearer {your_firebase_token}
```

Upload new versions anytime. Old versions are automatically replaced.

### 5. Right to Restrict Processing

You can restrict processing by:
- Not uploading files you don't want processed
- Deleting sessions you don't want kept
- Not starting new generation requests

### 6. Right to Object

You can object to processing by deleting your account (see Right to Erasure above).

## Privacy by Design

### Architecture

```
User Browser
    ↓ (HTTPS)
Next.js API (with auth)
    ↓
Firebase Storage (encrypted)
    ↓
Download to memory ONLY
    ↓
Process with Gemini API
    ↓
Temp files (/tmp - auto-deleted)
    ↓
Upload to Firebase Storage
    ↓
Delete temp files immediately
```

**Key privacy features:**
1. Files never stored permanently on server
2. Temp files isolated per request
3. Automatic cleanup after processing
4. No cross-contamination between users
5. No logging of sensitive data

### Security Measures

| Measure | Implementation |
|---------|---------------|
| **Authentication** | Firebase Auth required on ALL API routes |
| **Authorization** | Users can only access their own files |
| **Encryption in Transit** | HTTPS/TLS 1.2+ only |
| **Encryption at Rest** | Firebase Storage automatic encryption |
| **Access Control** | Firebase Security Rules enforce user isolation |
| **Signed URLs** | 15-minute expiry for downloads |
| **No Logging** | Privacy-aware logger sanitizes sensitive data |

### Third-Party Data Sharing

We share data with ONLY 2 third parties (both required for the service):

#### 1. Firebase/Google Cloud (Storage & Auth)
- **Purpose**: Store your files securely, authenticate you
- **Data shared**: Email, uploaded files
- **Location**: Configurable (US or EU)
- **Privacy Policy**: [Firebase Privacy](https://firebase.google.com/support/privacy)

#### 2. Google Gemini API (AI Processing)
- **Purpose**: Generate CV, cover letter, cold email
- **Data shared**: Job descriptions, your CV content
- **Training**: NOT used for model training (per Google AI terms)
- **Privacy Policy**: [Google AI Terms](https://ai.google.dev/terms)

**No other third parties** have access to your data.

## Data Processing Locations

- **Firebase Storage**: Configurable per project (US or EU)
- **Next.js Server**: Where you deploy (Vercel, AWS, etc.)
- **Gemini API**: Google Cloud infrastructure

## Legal Basis for Processing (GDPR Article 6)

| Processing Activity | Legal Basis |
|---------------------|-------------|
| Account creation & authentication | Consent + Contract |
| File storage | Contract (necessary to provide service) |
| AI document generation | Contract + Consent |
| Session history | Legitimate interest (service quality) |

## Data Breach Notification

In the unlikely event of a data breach:
1. We will notify you within **72 hours**
2. We will notify supervisory authorities if required
3. We will provide details of affected data
4. We will provide guidance on protective measures

## Privacy-Aware Logging

Our custom logger ensures **zero sensitive data** is logged:

```typescript
// ❌ BAD - Never do this
console.log('Generated CV:', cvContent);

// ✅ GOOD - Using our logger
logger.info('CV generated successfully', { 
  userId, 
  sessionId, 
  pageCount 
});
// cvContent is automatically redacted
```

**Redacted fields:**
- File contents
- Job descriptions
- CV text
- Email addresses
- Feedback/messages
- API keys/tokens

## Compliance Checklist

- [x] **Data minimization** - Only essential data stored
- [x] **Purpose limitation** - Data only used for stated purpose
- [x] **Storage limitation** - User-controlled retention
- [x] **Accuracy** - Users can update/correct data
- [x] **Integrity & confidentiality** - Encrypted, access-controlled
- [x] **Accountability** - This documentation + audit logs
- [x] **Right to access** - API endpoint implemented
- [x] **Right to portability** - Export endpoint implemented
- [x] **Right to erasure** - Delete endpoint implemented
- [x] **Right to rectification** - Update functionality implemented
- [x] **Privacy by design** - Built into architecture
- [x] **Privacy by default** - No optional tracking/analytics

## For Developers

### Adding New Features

When adding features, always ask:

1. **Do I need to store this data?** If no, don't store it.
2. **Can I anonymize this data?** If yes, do it.
3. **How long should I keep this?** Shorter is better.
4. **Who needs access?** Only the user, never cross-user.
5. **Am I logging sensitive data?** Use `logger.ts`, not `console.log`.

### Code Review Checklist

- [ ] No sensitive data in logs
- [ ] User can only access their own data
- [ ] All API routes have authentication
- [ ] No unnecessary data collection
- [ ] Temp files are cleaned up
- [ ] No hardcoded secrets

## Resources

- **Privacy Policy**: [PRIVACY.md](./PRIVACY.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Logger**: [lib/utils/logger.ts](./lib/utils/logger.ts)

## Contact

For privacy concerns or to exercise your rights:
- **Email**: [Your Email]
- **DPO**: [If required]

## Verification

To verify compliance, you can:

1. **Inspect API code**: All routes in `app/api/`
2. **Test data export**: Call `/api/user/export-data`
3. **Test deletion**: Call `/api/user/delete-session/{id}`
4. **Check logs**: No sensitive data in server logs
5. **Review Firebase Rules**: Storage rules enforce isolation

---

**Last Updated**: 2025-01-05  
**Compliance Officer**: [Your Name]  
**Next Review**: 2025-07-05 (6 months)
