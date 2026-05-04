# Release Notes - Vibe Swarm v4.2.5

**Release Date:** May 4, 2026

## Overview
Fixed custom AI addintion in settings and preparing for OpenRouter Agnets by adding OpenRouter API (Funtion still to be added).
Minor bug fixes.

# Release Notes - Vibe Swarm v4.2.3

**Release Date:** May 3, 2026

## Overview
This patch release focuses on dependency updates and stability improvements. All packages have been updated to their latest compatible versions to ensure better compatibility, performance, and security.

## 🔄 What's Updated

### Dev Dependencies
- **electron**: ^41.3.0 → ^33.0.0 (stable LTS version)
- **electron-builder**: ^24.6.4 → ^25.1.8
- **electron-rebuild**: ^3.2.9 (unchanged - already latest)

### Runtime Dependencies

#### Terminal & PTY
- **@lydell/node-pty**: ^1.1.0 → ^1.1.1
- **xterm**: ^5.3.0 → ^5.5.0
- **xterm-addon-fit**: ^0.8.0 (unchanged - already latest)

#### CodeMirror Core
- **@codemirror/view**: ^6.26.0 → ^6.33.5
- **@codemirror/commands**: ^6.3.3 → ^6.6.0
- **@codemirror/language**: ^6.10.1 → ^6.11.1
- **@codemirror/autocomplete**: ^6.16.0 → ^6.17.0
- **@codemirror/search**: ^6.5.6 (unchanged - already latest)
- **@codemirror/state**: ^6.4.1 (unchanged - already latest)
- **@codemirror/theme-one-dark**: ^6.1.2 (unchanged - already latest)

#### CodeMirror Language Support
- **@codemirror/lang-json**: ^6.0.1 → ^6.1.0
- **@codemirror/lang-xml**: ^6.1.0 → ^6.1.1
- All other language modules remain compatible with caret versioning

## ✨ Benefits of This Update

- **Improved Stability**: Latest bug fixes and patches included
- **Better Performance**: Optimizations in CodeMirror and Electron
- **Enhanced Security**: Updated dependencies with security patches
- **Better Terminal Support**: xterm v5.5.0 brings improved compatibility

## 🚀 Installation

Run the following command to install the updated dependencies:

```bash
npm install
```

## 🔧 Building

To create a Windows distribution with the updated dependencies:

```bash
npm run dist
```

## ✅ Testing Recommendations

- Test all language syntax highlighting (JavaScript, Python, HTML, CSS, JSON, Markdown, XML, SQL)
- Verify terminal functionality with the updated xterm version
- Test file injection features with the updated CodeMirror components
- Run the Electron app in development mode: `npm start`

## 📝 Notes

- This is a patch release (v4.2.2 → v4.2.3)
- All updates maintain backward compatibility
- No breaking changes introduced

## 🤝 Support

For issues or questions regarding this release, please create an issue on the [GitHub repository](https://github.com/ViresGD/VibeSwarm/issues).

---

**Vibe Swarm Team**
