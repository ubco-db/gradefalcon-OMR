import MockLmsService from './mockLmsService';

class LmsServiceFactory {
  static createService(lmsType, options = {}) {
    switch (lmsType.toLowerCase()) {
      case 'canvas':
        if (options.useMock || process.env.NODE_ENV === 'development') {
          return new MockLmsService();
        }
        // In production, would return actual Canvas service
        throw new Error('Canvas service not implemented yet. Use mock service for development.');
        
      case 'moodle':
        if (options.useMock || process.env.NODE_ENV === 'development') {
          return new MockLmsService();
        }
        // In production, would return actual Moodle service
        throw new Error('Moodle service not implemented yet. Use mock service for development.');
           
      case 'mock':
        return new MockLmsService();
        
      default:
        throw new Error(`Unsupported LMS type: ${lmsType}`);
    }
  }

  static getSupportedLmsTypes() {
    return ['canvas', 'moodle','mock'];
  }

  static isLmsTypeSupported(lmsType) {
    return this.getSupportedLmsTypes().includes(lmsType.toLowerCase());
  }
}

export default LmsServiceFactory;