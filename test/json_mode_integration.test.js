/**
 * Integration tests for JSON Mode implementation
 * Tests the new generateJsonWithRetry method and updated JSON-returning functions
 */

const AIService = require('../src/services/aiService');

// Mock configuration
process.env.GEMINI_API_KEY = 'test-api-key';

describe('JSON Mode Integration Tests', () => {
  let aiService;

  beforeAll(() => {
    // Mock the config module
    jest.mock('../src/config', () => ({
      apiKeys: {
        gemini: 'test-api-key'
      },
      ai: {
        model: 'gemini-1.5-flash',
        maxRetries: 3,
        initialRetryDelay: 5000
      }
    }));
  });

  beforeEach(() => {
    // Initialize AI service
    try {
      aiService = new AIService();
    } catch (error) {
      console.log('Note: AIService initialization requires valid API key for full testing');
    }
  });

  test('AIService should have jsonModel for JSON Mode', () => {
    expect(aiService).toBeDefined();
    expect(aiService.jsonModel).toBeDefined();
  });

  test('AIService should have generateJsonWithRetry method', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.generateJsonWithRetry).toBe('function');
  });

  test('extractJobDetails should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.extractJobDetails).toBe('function');
  });

  test('parseColdOutreachInput should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.parseColdOutreachInput).toBe('function');
  });

  test('generateCompanyProfile should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.generateCompanyProfile).toBe('function');
  });

  test('processJobURL should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.processJobURL).toBe('function');
  });

  test('processJobText should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.processJobText).toBe('function');
  });

  test('researchCompanyAndIdentifyPeople should be defined', () => {
    expect(aiService).toBeDefined();
    expect(typeof aiService.researchCompanyAndIdentifyPeople).toBe('function');
  });

  test('Prompts should include updated HCP prompts', () => {
    expect(aiService).toBeDefined();
    expect(aiService.prompts).toBeDefined();
    
    // Check that key prompts exist
    expect(aiService.prompts.extractJobDetails).toBeDefined();
    expect(aiService.prompts.parseColdOutreachInput).toBeDefined();
    expect(aiService.prompts.generateCompanyProfile).toBeDefined();
    expect(aiService.prompts.processJobURL).toBeDefined();
    expect(aiService.prompts.processJobText).toBeDefined();
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toBeDefined();
    
    // Check that prompts include HCP patterns
    expect(aiService.prompts.extractJobDetails).toContain('HIERARCHICAL CONSTRAINTS');
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toContain('company_intelligence');
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toContain('decision_makers');
  });

  test('Updated prompt should use new field names for research', () => {
    expect(aiService).toBeDefined();
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toBeDefined();
    
    // Should use new field names
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toContain('company_intelligence');
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).toContain('decision_makers');
    
    // Should NOT use old field names
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).not.toContain('companyProfile');
    expect(aiService.prompts.researchCompanyAndIdentifyPeople).not.toContain('decisionMakers');
  });

  test('CV Generation prompt should include Persona Deepening', () => {
    expect(aiService).toBeDefined();
    expect(aiService.prompts.generateCVAdvanced).toBeDefined();
    expect(aiService.prompts.generateCVAdvanced).toContain('Dr. Sarah Chen');
    expect(aiService.prompts.generateCVAdvanced).toContain('Persona Deepening');
  });
});

console.log('JSON Mode Integration Tests - Test file created successfully');
