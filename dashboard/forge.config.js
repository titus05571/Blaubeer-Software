
export default {
  packagerConfig: {
    asar: true
  },

  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'BlaubeerSoftware',
        authors: 'Blaubeer Software',
        description: 'Blaubeer Software Desktop Application',
        noMsi: true
      }
    }
  ]
};
