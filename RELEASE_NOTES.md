# Release Notes

## Version 4.2.3 - May 3, 2026

### 🔄 Dependencies Updated

#### Dev Dependencies
- **electron**: Updated to ^33.0.0 (Stable LTS version)
- **electron-builder**: Updated to ^25.1.8
- **electron-rebuild**: Maintained at ^3.2.9

#### Runtime Dependencies
- **@lydell/node-pty**: ^1.1.1
- **xterm**: Updated to ^5.5.0 (Enhanced terminal capabilities)
- **@codemirror/view**: Updated to ^6.33.5
- **@codemirror/commands**: Updated to ^6.6.0
- **@codemirror/language**: Updated to ^6.11.1
- **@codemirror/autocomplete**: Updated to ^6.17.0
- **@codemirror/lang-json**: Updated to ^6.1.0
- **@codemirror/lang-xml**: Updated to ^6.1.1

### ✨ Highlights
- Improved code editor stability with latest CodeMirror packages
- Enhanced terminal functionality with updated xterm
- Better compatibility with Electron's latest LTS release
- All dependencies now at their latest compatible versions

### 🔧 Installation
```bash
npm install
```

### 📋 Notes
- Run `npm audit` to verify no security vulnerabilities
- Rebuild native modules with: `npm run postinstall`
- Test the application thoroughly before deploying to production

---

**Previous Version**: 4.2.2  
**Release Date**: May 3, 2026
