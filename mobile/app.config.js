const fs = require('node:fs');
const path = require('node:path');

// The repository is public. Keep purchased keys in the build environment or
// this gitignored local file; they are embedded only where the native SDK needs them.
module.exports = ({ config }) => {
  const licenseFile = path.join(__dirname, 'transistorsoft.licenses.local.json');
  const local = fs.existsSync(licenseFile)
    ? JSON.parse(fs.readFileSync(licenseFile, 'utf8'))
    : {};
  const iosLicense = process.env.TRANSISTORSOFT_IOS_LICENSE || local.ios;
  const androidLicense = process.env.TRANSISTORSOFT_ANDROID_LICENSE || local.android;
  const production = process.env.NODE_ENV === 'production'
    || ['production', 'preview'].includes(process.env.EAS_BUILD_PROFILE);
  const platform = process.env.EAS_BUILD_PLATFORM || process.env.SPOTTED_BUILD_PLATFORM;
  if (production) {
    if (platform !== 'android' && !iosLicense) {
      throw new Error('Missing TRANSISTORSOFT_IOS_LICENSE. Configure the paid location license before a release build.');
    }
    if (platform !== 'ios' && !androidLicense) {
      throw new Error('Missing TRANSISTORSOFT_ANDROID_LICENSE. Configure the paid location license before a release build.');
    }
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(iosLicense ? { TSLocationManagerLicense: iosLicense } : {}),
      },
    },
    plugins: config.plugins.map((plugin) => {
      const [name, options = {}] = Array.isArray(plugin) ? plugin : [plugin];
      if (name !== 'react-native-background-geolocation' || !androidLicense) return plugin;
      return [name, { ...options, license: androidLicense }];
    }),
  };
};
