/**
 * Crypto polyfill for React Native using react-native-quick-crypto
 */
// Install crypto polyfill globally
if (typeof global !== 'undefined') {
  const { install } = require('react-native-quick-crypto');
  install();
}

export default {};
