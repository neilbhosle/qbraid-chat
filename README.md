# qBraid Chat Extension for VS Code

A VS Code extension that integrates with qBraid's quantum computing platform, providing chat functionality and quantum job management.

## 🔹 Features
- Authenticate and interact with the qBraid API using an API key.
- Send chat messages and receive streamed responses.
- Select a model from the available qBraid chat models.
- (Optional) Query real-time quantum device availability and job statuses.


## 📦 Installation
1. Download the `.vsix` file
2. Install using VS Code:
   ```bash
   code --install-extension qbraid-chat-0.1.0.vsix

## 🔧 Usage

1. Open the **qBraid Chat** panel in VS Code.
2. Enter your qBraid API Key when prompted.
3. Start chatting with the selected model.

## 🔄 Development

To contribute or modify:
```bash
git clone https://github.com/your-repo/qbraid-chat.git
cd qbraid-chat
npm install

## 📩 Submission

To submit your extension to qBraid, zip the project and upload it:
```bash
zip -r qbraid-chat.zip qbraid-chat -x "*/node_modules/*" "*/dist/*" "*/out/*" "*/.git/*" "*.vsix"
qbraid files upload qbraid-chat.zip --namespace fullstack-challenge

## 📜 License

This project is licensed under the [MIT License](LICENSE).

## 🤝 Support

For issues related to API access or submission:
- 📧 Email: **contact@qbraid.com**  
- 📖 [qBraid API Docs](https://docs.qbraid.com/api-reference/user-guide/introduction)
