// ELEMENTOS
const messageInput = document.querySelector(".message-input");
const chatBody = document.querySelector(".chat-body");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const FileCalcelButton = document.querySelector("#file-calcel");
const micButton = document.querySelector("#mic-btn");

// FALA DO BOT
const synth = window.speechSynthesis;
let voicesLoaded = false;
let ptVoice = null;

const loadVoices = () => {
    return new Promise((resolve) => {
        let voices = synth.getVoices();
        if (voices.length !== 0) {
            ptVoice = voices.find(v => v.lang === "pt-BR" || v.lang.startsWith("pt"));
            voicesLoaded = true;
            resolve();
        } else {
            synth.addEventListener("voiceschanged", () => {
                voices = synth.getVoices();
                ptVoice = voices.find(v => v.lang === "pt-BR" || v.lang.startsWith("pt"));
                voicesLoaded = true;
                resolve();
            }, { once: true });
        }
    });
};

const speak = async (text) => {
    if (!'speechSynthesis' in window) return;

    await loadVoices();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;

    if (ptVoice) utterance.voice = ptVoice;

    synth.cancel(); // Evita sobreposição
    synth.speak(utterance);
};

// HISTÓRICO COMPLETO DE CONVERSA
const chatHistory = [];

const API_KEY = "AIzaSyCiKAjpH-0jUOnX4xjpO7eEmlBN1HuqeOQ";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const userData = {
    message: null,
    file: {
        data: null,
        mime_type: null
    }
}

// Flag para saber se a mensagem veio do microfone
let fromMic = false;

const createMenssageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
}

// RESPOSTA DO CHAT USANDO A API
const generateBotResponse = async (incomingMessageDiv) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    const parts = [{ text: userData.message }];
    if (userData.file.data) {
        parts.push({ inline_data: userData.file });
    }

    // Adiciona instrução do sistema apenas uma vez
    if (!chatHistory.some(msg => msg.role === "system")) {
        chatHistory.unshift({
            role: "user",
            parts: [{
                text: "A partir de agora, aja como Luma, uma assistente especializada em tecnologia e inovação. Responda apenas perguntas relacionadas a esses temas. Se a pergunta estiver fora disso, diga que só responde perguntas sobre tecnologia e inovação."
            }]
        });
    }

    // Adiciona a pergunta do usuário
    chatHistory.push({
        role: "user",
        parts: parts
    });

    const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: chatHistory })
    };

    try {
        const response = await fetch(API_URL, requestOptions);
        const data = await response.json();
        if (!response.ok || !data.candidates || !data.candidates[0]) {
            throw new Error(data.error?.message || "Resposta inválida.");
        }

        const apiResponseText = data.candidates[0].content.parts[0].text.replace(/\*\*(.*?)\*\*/g, "$1").trim();
        messageElement.innerText = apiResponseText;

        // Salva resposta do bot
        chatHistory.push({
            role: "model",
            parts: [{ text: apiResponseText }]
        });

        if (fromMic && 'speechSynthesis' in window) {
            await speak(apiResponseText);
        }

    } catch (error) {
        console.error("Erro na API:", error);
        messageElement.innerText = "Erro ao obter resposta.";
        messageElement.style.color = 'red';
    } finally {
        userData.file = {};
        incomingMessageDiv.classList.remove("thinking");
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        fromMic = false;
    }
};


const handleOutgoingMessage = (e) => {
    e.preventDefault();
    userData.message = messageInput.value.trim();
    if (!userData.message) return;

    messageInput.value = "";
    fileUploadWrapper.classList.remove("file-uploaded");

    const messageContent = `<div class="message-text"></div>
        ${userData.file.data ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="attachment" />` : ""}`;

    const outgoingMessageDiv = createMenssageElement(messageContent, "user-message");
    outgoingMessageDiv.querySelector(".message-text").textContent = userData.message;
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    setTimeout(() => {
        const botMessageContent = `<img class="bot-avatar" src="imgs/logo.Chatbot.LUMA.png" alt="">
            <div class="message-text"> 
                <div class="thinking-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div> 
            </div>`;

        const incomingMessageDiv = createMenssageElement(botMessageContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        generateBotResponse(incomingMessageDiv);
    }, 600);
}

// ENTER para enviar mensagem
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.value.trim()) {
        handleOutgoingMessage(e);
    }
});

// ARQUIVOS
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        fileUploadWrapper.querySelector("img").src = e.target.result;
        fileUploadWrapper.classList.add("file-uploaded");

        const base64String = e.target.result.split(",")[1];
        userData.file = {
            data: base64String,
            mime_type: file.type
        }

        fileInput.value = "";
    }

    reader.readAsDataURL(file);
});

sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
document.querySelector("#file-upload").addEventListener("click", () => fileInput.click());
FileCalcelButton.addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("file-uploaded");
});

// MICROFONE: TRANSCRIÇÃO EM TEMPO REAL + ENVIO AO PARAR
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
let isRecording = false;

recognition.lang = "pt-BR";
recognition.interimResults = true;

let finalTranscript = "";

recognition.addEventListener("result", (event) => {
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript;
        } else {
            interimTranscript += transcript;
        }
    }

    messageInput.value = (finalTranscript + interimTranscript).trim();
});

recognition.addEventListener("end", () => {
    micButton.classList.remove("recording");
    isRecording = false;

    if (finalTranscript.trim() !== "") {
        messageInput.value = finalTranscript.trim();
        fromMic = true;
        const fakeEvent = new Event("submit");
        handleOutgoingMessage(fakeEvent);
        finalTranscript = "";
    }
});

micButton.addEventListener("click", () => {
    if (isRecording) {
        recognition.stop();
    } else {
        finalTranscript = "";
        recognition.start();
        micButton.classList.add("recording");
        isRecording = true;
    }
});




// INTRO 

window.addEventListener("load", () => {
    const intro = document.getElementById("intro");
    const introText = document.getElementById("introText");
  
    // Texto depois do "Inicializando sistema..."
    setTimeout(() => {
      introText.innerText = "Olá, eu sou a Luma...";
      introText.style.animation = "none";
      void introText.offsetWidth; // reinicia animação
      introText.style.animation = "typing 3s steps(40, end) forwards, blink 0.8s step-end infinite";
    }, 4000);
  
    // Esconde a intro e revela o chat
    setTimeout(() => {
      intro.style.opacity = 0;
      setTimeout(() => {
        intro.style.display = "none";
      }, 1000);
    }, 8000);
  });
  
  
