
import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import { AxiosError } from 'axios';
import { marked } from 'marked';

function getApiBaseUrl(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    return 'https://api.qbraid.com/api'; 
  }

  const qbraidrcPath = path.join(homeDir, '.qbraid', 'qbraidrc');
  if (fs.existsSync(qbraidrcPath)) {
    try {
      const config = ini.parse(fs.readFileSync(qbraidrcPath, 'utf-8'));
      return config.default?.url || 'https://api.qbraid.com/api';
    } catch (error) {
      console.error('Failed to parse qbraidrc file:', error);
    }
  }
  return 'https://api.qbraid.com/api';
}

const baseUrl = getApiBaseUrl();
const modelsUrl = `${baseUrl}/chat/models`;
const chatUrl = `${baseUrl}/chat`;

function getApiKeyFromFile(): string | undefined {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    return undefined;
  }

  const qbraidrcPath = path.join(homeDir, '.qbraid', 'qbraidrc');
  if (fs.existsSync(qbraidrcPath)) {
    try {
      const config = ini.parse(fs.readFileSync(qbraidrcPath, 'utf-8'));
      const apiKey = config.default?.['api-key']?.trim();
      return apiKey;
    } catch (error) {
      console.error('Failed to parse qbraidrc file:', error);
    }
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const openChatCommand = vscode.commands.registerCommand('qbraid-chat.openChat', async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      vscode.window.showErrorMessage('API Key not found. Please set your qBraid API Key first.');
      return;
    }

    const models = await fetchModels(apiKey);
    if (models.length === 0) {
      vscode.window.showErrorMessage('Failed to fetch models. Check API key or network connection.');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'qbraidChat',
      'qBraid Chat',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(models);

    panel.webview.onDidReceiveMessage(
      async (message) => {
        const command = detectCommand(message.text);
        if (command) {
        switch (command) {
          case 'devices':
            try {
              const devices = await fetchQuantumDevices(apiKey);
              panel.webview.postMessage({ command: 'response', text: formatDevices(devices) });
            } catch (error) {
              handleApiError(error, panel);
            }
            break;
  
          case 'job-status':
            try {
              const jobStatus = await fetchJobStatus(apiKey);
              panel.webview.postMessage({ command: 'response', text: formatJobStatus(jobStatus) });
            } catch (error) {
              handleApiError(error, panel);
            }
            break;
        }
      } else {
        try {
          const response = await axios.post(
            'https://api.qbraid.com/api/chat',
            {
              prompt: message.text,
              model: message.model,
              stream: true 
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
              },
              responseType: 'stream'
            }
          );
  
          let fullResponse = '';
          response.data.on('data', (chunk: Buffer) => {
            fullResponse += chunk.toString();
            panel.webview.postMessage({ 
              command: 'responseChunk', 
              text: fullResponse 
            });
          });
  
          response.data.on('end', () => {
            panel.webview.postMessage({ 
              command: 'responseComplete' 
            });
          });
  
        } catch (error) {
          handleApiError(error, panel);
        }
      }
    },
    undefined,
    context.subscriptions
  );
  });

  const setApiKeyCommand = vscode.commands.registerCommand('qbraid-chat.setApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your qBraid API Key',
      placeHolder: 'API Key',
      password: true
    });
  
    if (apiKey) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (homeDir) {
        const qbraidrcPath = path.join(homeDir, '.qbraid', 'qbraidrc');
        try {
          fs.writeFileSync(qbraidrcPath, JSON.stringify({ apiKey }, null, 2));
          vscode.window.showInformationMessage('API Key saved to ~/.qbraid/qbraidrc');
        } catch (error) {
          vscode.window.showErrorMessage('Failed to save API Key to ~/.qbraid/qbraidrc');
        }
      } else {
        vscode.window.showErrorMessage('Could not determine home directory.');
      }
    }
  });

  context.subscriptions.push(openChatCommand, setApiKeyCommand);
}

function getApiKey(): string | undefined {
  return getApiKeyFromFile() || vscode.workspace.getConfiguration('qbraidChat').get('apiKey');
}

async function fetchModels(apiKey: string): Promise<any[]> {
  try {
    const response = await axios.get(modelsUrl, {
      headers: { 'api-key': apiKey }
    });
    return response.data || [];
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
}

function handleApiError(error: unknown, panel: vscode.WebviewPanel) {
  let errorMessage = 'Failed to fetch job status.';

  if (axios.isAxiosError(error)) {
    if (error.response) {
      errorMessage += `\nStatus: ${error.response.status}\nMessage: ${error.response.data.message || 'No error message'}`;
    } else if (error.request) {
      errorMessage += '\nNo response from server. Check your network connection.';
    } else {
      errorMessage += `\nError: ${error.message}`;
    }
  } else if (error instanceof Error) {
    errorMessage += `\nError: ${error.message}`;
  } else {
    errorMessage += '\nAn unknown error occurred.';
  }

  panel.webview.postMessage({ command: 'response', text: errorMessage });
}

function detectCommand(message: string): string | null {
  if (message.toLowerCase().includes('quantum devices')) {
    return 'devices';
  }
  if (message.toLowerCase().includes('status of my most recent job')) {
    return 'job-status';
  }
  return null;
}

async function fetchQuantumDevices(apiKey: string): Promise<any> {
  try {
    const response = await axios.get('https://api.qbraid.com/api/quantum-devices', {
      headers: { 'api-key': apiKey }
    });
    console.log('Devices API Response:', response.data); 
    return response.data;
  } catch (error) {
    console.error('Failed to fetch quantum devices:', error);
    throw error;
  }
}

function formatDevices(devices: any[]): string {
  if (!devices || devices.length === 0) {
    return 'No quantum devices found.';
  }
  return devices
    .map((device) => {
      const availability = device.isAvailable ? 'Available' : `Next available: ${device.nextAvailable}`;
      return `
        - **${device.name}** (${device.qbraid_id})
          - Provider: ${device.provider}
          - Qubits: ${device.numberQubits}
          - Status: ${device.status}
          - Availability: ${availability}
      `;
    })
    .join('\n');
}

async function fetchJobStatus(apiKey: string): Promise<any> {
  try {
    const response = await axios.get('https://api.qbraid.com/api/quantum-jobs', {
      headers: { 'api-key': apiKey }
    });
    console.log('Jobs API Response:', response.data); 

    if (!response.data.jobsArray || response.data.jobsArray.length === 0) {
      throw new Error('No jobs found.');
    }

    return response.data.jobsArray[0]; 
  } catch (error) {
    console.error('Failed to fetch job status:', error);
    throw error; 
  }
}

function formatJobStatus(job: any): string {
  return `
    - **Job ID**: ${job.qbraidJobId}
    - **Status**: ${job.status}
    - **Device**: ${job.qbraidDeviceId}
    - **Created At**: ${job.timeStamps.createdAt}
    - **Execution Duration**: ${job.timeStamps.executionDuration || 'N/A'} ms
    - **Shots**: ${job.shots}
    - **Cost**: ${job.cost || 'N/A'} credits
  `;
}

function getWebviewContent(models: any[]): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>qBraid Chat</title>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <style>
            :root {
                --primary-color: #007acc;
                --background-color: #1e1e1e;
                --input-background: #252526;
                --text-color: #ffffff;
                --bot-bubble: #2d2d2d;
                --user-bubble: #005999;
            }

            body {
                margin: 0;
                padding: 20px;
                background-color: var(--background-color);
                color: var(--text-color);
                font-family: 'Segoe UI', system-ui, sans-serif;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }

            #chat-container {
                flex: 1;
                display: flex;
                flex-direction: column;
                max-width: 800px;
                margin: 0 auto;
                width: 100%;
            }

            #messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px 0;
                display: flex;
                flex-direction: column;
                gap: 15px;
                scrollbar-width: thin;
                scrollbar-color: var(--primary-color) transparent;
            }

            #messages::-webkit-scrollbar {
                width: 8px;
            }

            #messages::-webkit-scrollbar-thumb {
                background-color: var(--primary-color);
                border-radius: 4px;
            }

            .message {
                max-width: 80%;
                padding: 16px 20px;
                border-radius: 18px;
                line-height: 1.5;
                animation: fadeIn 0.3s ease-in;
            }

            .user-message {
                background-color: var(--user-bubble);
                color: white;
                align-self: flex-end;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .bot-message {
                background-color: var(--bot-bubble);
                align-self: flex-start;
                border: 1px solid #383838;
            }

            .bot-message code {
                background-color: rgba(255,255,255,0.1);
                padding: 2px 4px;
                border-radius: 4px;
                font-family: 'Fira Code', monospace;
            }

            .bot-message pre {
                background-color: rgba(0,0,0,0.3) !important;
                padding: 12px;
                border-radius: 8px;
                overflow-x: auto;
                margin: 10px 0;
            }

            .bot-message ul,
            .bot-message ol {
                padding-left: 24px;
                margin: 8px 0;
            }

            #input-container {
                display: flex;
                gap: 12px;
                padding: 20px 0;
                border-top: 1px solid #383838;
                position: sticky;
                bottom: 0;
                background: var(--background-color);
            }

            #model-select {
                padding: 12px;
                background: var(--input-background);
                color: var(--text-color);
                border: 1px solid #383838;
                border-radius: 8px;
                min-width: 200px;
                appearance: none;
                background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
                background-repeat: no-repeat;
                background-position: right 8px center;
                background-size: 12px auto;
            }

            #message-input {
                flex: 1;
                padding: 12px;
                background: var(--input-background);
                color: var(--text-color);
                border: 1px solid #383838;
                border-radius: 8px;
                font-size: 16px;
                outline: none;
                transition: border-color 0.2s;
            }

            #message-input:focus {
                border-color: var(--primary-color);
            }

            #send-button {
                padding: 12px 24px;
                background-color: var(--primary-color);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }

            #send-button:hover {
                background-color: #0062a3;
            }

            .loading {
                display: inline-block;
                width: 24px;
                height: 24px;
                border: 3px solid rgba(255,255,255,0.3);
                border-radius: 50%;
                border-top-color: white;
                animation: spin 1s ease-in-out infinite;
            }

            .error-message {
                background-color: #3a1e1e;
                border: 1px solid #ff4444;
                color: #ff4444;
                padding: 12px;
                border-radius: 8px;
                margin: 10px 0;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @media (max-width: 600px) {
                #input-container {
                    flex-wrap: wrap;
                }
                #model-select {
                    min-width: 100%;
                    order: 1;
                }
            }
        </style>
    </head>
    <body>
        <div id="chat-container">
            <div id="messages"></div>
            <div id="input-container">
                <select id="model-select">
                    ${models.map(m => `<option value="${m.model}">${m.model}</option>`).join('')}
                </select>
                <input type="text" id="message-input" placeholder="Type your message...">
                <button id="send-button">Send</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const messagesContainer = document.getElementById('messages');
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            const modelSelect = document.getElementById('model-select');

            let currentResponse = null;
            let loadingIndicator = null;

            function addMessage(content, isUser = false) {
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${isUser ? 'user-message' : 'bot-message'}\`;
                
                if (typeof content === 'string') {
                    messageDiv.innerHTML = isUser ? content : marked.parse(content);
                } else {
                    messageDiv.appendChild(content);
                }
                
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            function showLoading() {
                if (loadingIndicator) return;
                
                loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'message bot-message';
                loadingIndicator.innerHTML = '<div class="loading"></div>';
                messagesContainer.appendChild(loadingIndicator);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

            function hideLoading() {
                if (loadingIndicator) {
                    messagesContainer.removeChild(loadingIndicator);
                    loadingIndicator = null;
                }
            }

            sendButton.addEventListener('click', () => {
                const message = messageInput.value.trim();
                const model = modelSelect.value;
                
                if (message) {
                    addMessage(message, true);
                    showLoading();
                    messageInput.value = '';
                    vscode.postMessage({ 
                        command: 'sendMessage', 
                        text: message, 
                        model: model 
                    });
                }
            });

            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendButton.click();
                }
            });

            window.addEventListener('message', (event) => {
                const message = event.data;
                
                switch(message.command) {
                    case 'responseChunk':
                        hideLoading();
                        if (!currentResponse) {
                            currentResponse = document.createElement('div');
                            currentResponse.className = 'message bot-message';
                            messagesContainer.appendChild(currentResponse);
                        }
                        currentResponse.innerHTML = marked.parse(message.text);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        break;
                        
                    case 'responseComplete':
                        currentResponse = null;
                        break;
                        
                    case 'error':
                        hideLoading();
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'error-message';
                        errorDiv.textContent = message.text;
                        messagesContainer.appendChild(errorDiv);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        break;
                }
            });
        </script>
    </body>
    </html>
  `;
}
export function deactivate() {}
