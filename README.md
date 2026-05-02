# 🐝 Vibe Swarm

A multi-AI coding workspace for developers who don't want to be locked into one AI tool. Use free tier AI's and transfer your content between them.
Stop juggling tabs. Your editor, terminal and every major AI assistant — all in one window.


<img width="1911" height="1025" alt="screenshot" src="https://github.com/user-attachments/assets/d0aac355-214f-493a-b806-f10afbb0d631" />


## What it does

- **Multi-tab code editor** with syntax highlighting and IntelliSense for 20+ languages
- **Switch between AI assistants** — Claude, ChatGPT, Gemini, DeepSeek, Grok and more in one click
- **Drag & drop files** directly into any AI chat
- **Built-in terminal** with command snippet library
- **Live HTML preview** — edit and see changes instantly
- **Detachable panels** — move the browser or terminal to a second monitor
- **Context file generator** — bundle your whole project into one file for AI context

## Download

👉 [Download the latest installer](https://github.com/ViresGD/VibeSwarm/releases/latest)

Windows supported.

## Run from source

```bash
git clone https://github.com/YOURUSERNAME/vibe-swarm.git
cd vibe-swarm
npm install
npm start
```

## Build installer

```bash
npm run dist
```

## Customizing the snippet library

Edit `insert.json` in the app folder to add your own terminal command shortcuts. 
No restart needed — the file is read fresh every time you open the Insert panel.

## Tech stack

- Electron
- CodeMirror 6
- xterm.js
- node-pty

## License

MIT
