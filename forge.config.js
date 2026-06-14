const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    // Disable ASAR during diagnosis to speed up packaging (re-enable for releases)
    asar: false,
    // Remove `devDependencies` from the packaged app to reduce size and speed up packaging
    prune: true,
    // Ignore common non-app files to avoid unnecessary copying
    ignore: ["\\.git", "pack_test.txt", "\\.gitattributes"],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    // Auto-unpack natives and FusesPlugin temporarily disabled for diagnosis.
  ],
};
