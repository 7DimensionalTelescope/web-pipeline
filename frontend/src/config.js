// Centralized configuration for the application
export const config = {
  // API Base URL configuration
  // Change this to switch between development and production environments
  baseurl: '/pipeline/api/',
  
  // Alternative configurations (uncomment one to use):
  //baseurl: 'http://localhost:1111/api/',  // For local development
  // baseurl: 'https://your-production-domain.com/api/',  // For production
};

// Export the baseurl for easy access
export const { baseurl } = config;

// QA Parameters Configuration
// Available parameters organized by data type with type information
export const parametersByDataType = {
  bias: [
    { value: 'clipmed', label: 'CLIPMED', type: 'int' },
    { value: 'clipstd', label: 'CLIPSTD', type: 'float' },
    { value: 'clipmin', label: 'CLIPMIN', type: 'int' },
    { value: 'clipmax', label: 'CLIPMAX', type: 'int' },
  ],
  dark: [
    { value: 'clipmed', label: 'CLIPMED', type: 'int' },
    { value: 'clipstd', label: 'CLIPSTD', type: 'float' },
    { value: 'clipmin', label: 'CLIPMIN', type: 'int' },
    { value: 'clipmax', label: 'CLIPMAX', type: 'int' },
    { value: 'uniform', label: 'UNIFORM', type: 'float' },
    { value: 'nhotpix', label: 'NHOTPIX', type: 'int' },
  ],
  flat: [
    { value: 'clipmed', label: 'CLIPMED', type: 'int' },
    { value: 'clipstd', label: 'CLIPSTD', type: 'float' },
    { value: 'clipmin', label: 'CLIPMIN', type: 'int' },
    { value: 'clipmax', label: 'CLIPMAX', type: 'int' },
    { value: 'edgevar', label: 'EDGEVAR', type: 'float' },
    { value: 'sigmean', label: 'SIGMEAN', type: 'float' },
  ],
  science: [
    { value: 'awincrmn', label: 'AWINCRMN', type: 'float' },
    { value: 'astrometric_offset', label: 'ASTROMETRIC_OFFSET', type: 'float' },
    { value: 'ellipmn', label: 'ELLIPMN', type: 'float' },
    { value: 'ellipticity', label: 'ELLIPTICITY', type: 'float' },
    { value: 'ezp_auto', label: 'EZP_AUTO', type: 'float' },
    { value: 'rotang1', label: 'ROTANG1', type: 'float' },
    { value: 'rsep_p95', label: 'RSEP_P95', type: 'float' },
    { value: 'rsep_q2', label: 'RSEP_Q2', type: 'float' },
    { value: 'rsep_rms', label: 'RSEP_RMS', type: 'float' },
    { value: 'seeing', label: 'SEEING', type: 'float' },
    { value: 'skysig', label: 'SKYSIG', type: 'float' },
    { value: 'skyval', label: 'SKYVAL', type: 'float' },
    { value: 'stdnumb', label: 'STDNUMB', type: 'int' },
    { value: 'ul5_5', label: 'UL5_5', type: 'float' },
    { value: 'unmatch', label: 'UNMATCH', type: 'int' },
    { value: 'zp_auto', label: 'ZP_AUTO', type: 'float' },
  ]
};

// Data type options for QA component
export const dataTypeOptions = [
  { value: 'bias', label: 'Bias' },
  { value: 'dark', label: 'Dark' },
  { value: 'flat', label: 'Flat' },
  { value: 'science', label: 'Science' },
];
