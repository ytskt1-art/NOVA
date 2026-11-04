
// ======================================
//          NOVA AI - GROQ ENGINE
// ======================================

const GROQ_API_KEY = "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";
const MODEL = "openai/gpt-oss-20b";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";


const chat = document.getElementById("chat");
const emptyState = document.createElement("div");
emptyState.className = "empty-state";
emptyState.innerHTML = '<img class="welcome-logo" src="nova-logo.png" alt="NOVA AI logo"><h1>What can I help you with?</h1>';
chat.replaceChildren(emptyState);
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const imageBtn = document.getElementById("imageBtn");
const newChatBtn = document.getElementById("newChatBtn");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const conversationLabel = document.getElementById("conversationLabel");
const settingsBtn = document.getElementById("settingsBtn");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsClose = document.getElementById("settingsClose");
const settingsReset = document.getElementById("settingsReset");
const settingsTheme = document.getElementById("settingsTheme");
const settingsAccent = document.getElementById("settingsAccent");
const settingsTextSize = document.getElementById("settingsTextSize");
const settingsTextSizeValue = document.getElementById("settingsTextSizeValue");
const settingsVoice = document.getElementById("settingsVoice");
const settingsSpeechLanguage = document.getElementById("settingsSpeechLanguage");

const defaultAppearance = { theme: "light", accent: "#5555d6", textSize: 15, voiceEnabled: true, speechLanguage: "en-IN" };
let appearance = { ...defaultAppearance };
try {
  appearance = { ...appearance, ...JSON.parse(localStorage.getItem("novaAppearance") || "{}") };
} catch { }

function applyAppearance() {
  document.body.dataset.theme = appearance.theme === "dark" ? "dark" : "light";
  document.documentElement.style.setProperty("--accent", appearance.accent);
  const size = Math.max(13, Math.min(19, Number(appearance.textSize) || 15));
  document.documentElement.style.setProperty("--chat-font-size", `${size}px`);
  settingsTheme.value = document.body.dataset.theme;
  settingsAccent.value = appearance.accent;
  settingsTextSize.value = size;
  settingsTextSizeValue.textContent = size;
  settingsVoice.checked = appearance.voiceEnabled !== false;
  settingsSpeechLanguage.value = appearance.speechLanguage === "hi-IN" ? "hi-IN" : "en-IN";
}

function saveAppearance() {
  try { localStorage.setItem("novaAppearance", JSON.stringify(appearance)); } catch { }
  applyAppearance();
}

let speechRequestId = 0;
let activeSpeechAudio = null;
let speechAudioContext = null;

function cleanSpeechText(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, " code example omitted ")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeechText(text, maxLength = 185) {
  const words = text.split(/\s+/);
  const chunks = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && `${chunk} ${word}`.length > maxLength) {
      chunks.push(chunk);
      chunk = word;
    } else {
      chunk = chunk ? `${chunk} ${word}` : word;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function stopReplySpeech() {
  speechRequestId += 1;
  if (activeSpeechAudio) {
    activeSpeechAudio.pause();
    activeSpeechAudio.onended?.();
    activeSpeechAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function getIndianSpeechVoice(language) {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const languageCode = language.split("-")[0].toLowerCase();
  const matchingVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languageCode));
  const maleVoice = matchingVoices.find((voice) =>
    /\b(ravi|hemant|madhur|prabhat|male|man)\b/i.test(voice.name)
  );
  const indianVoice = maleVoice || matchingVoices.find((voice) =>
    /\b(india|indian|heera|swara|kalpana|neerja|priya)\b|हिन्दी|हिंदी/i.test(`${voice.name} ${voice.lang}`)
      && !/\b(female|woman|heera|swara|kalpana|neerja|priya)\b/i.test(voice.name)
  );
  return indianVoice || null;
}

function speakWithBrowser(text, language = "en-US", preferredVoice = null) {
  if (!("speechSynthesis" in window)) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = 0.96;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const languageCode = language.split("-")[0].toLowerCase();
  const matchingVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languageCode));
  utterance.voice = preferredVoice
    || matchingVoices.find((voice) => /\b(ravi|hemant|madhur|prabhat|male|man)\b/i.test(voice.name))
    || matchingVoices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase())
    || matchingVoices[0]
    || null;
  window.speechSynthesis.speak(utterance);
  return true;
}

async function speakReply(text) {
  if (appearance.voiceEnabled === false) return;
  const spokenText = cleanSpeechText(text);
  if (!spokenText) return;

  stopReplySpeech();
  if (/[\u0900-\u097f]/.test(spokenText)) {
    speakWithBrowser(spokenText, "hi-IN", getIndianSpeechVoice("hi-IN"));
    return;
  }
  const requestId = speechRequestId;
  try {
    for (const chunk of splitSpeechText(spokenText, 800)) {
      if (requestId !== speechRequestId) return;
      const speechText = /[\u0900-\u097f]/.test(chunk)
        ? `[male Indian voice, natural conversational tone] ${chunk}`
        : `[male Indian English voice, natural conversational tone] ${chunk}`;
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speechText })
      });
      if (!response.ok) {
        let details = `Fish Audio speech request failed (${response.status}).`;
        try { details = (await response.json()).error || details; } catch { }
        throw new Error(details);
      }
      if (requestId !== speechRequestId) return;

      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audio.volume = 1;
      activeSpeechAudio = audio;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          speechAudioContext ||= new AudioContextClass();
          await speechAudioContext.resume();
          const source = speechAudioContext.createMediaElementSource(audio);
          const gain = speechAudioContext.createGain();
          gain.gain.value = 1.4;
          source.connect(gain);
          gain.connect(speechAudioContext.destination);
          try {
            await new Promise((resolve, reject) => {
              audio.onended = resolve;
              audio.onerror = () => reject(new Error("Could not play the generated voice."));
              audio.play().catch(reject);
            });
          } finally {
            source.disconnect();
            gain.disconnect();
          }
        } else {
          await new Promise((resolve, reject) => {
            audio.onended = resolve;
            audio.onerror = () => reject(new Error("Could not play the generated voice."));
            audio.play().catch(reject);
          });
        }
      } finally {
        URL.revokeObjectURL(audioUrl);
      }
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
    }
  } catch (error) {
    console.warn("Fish Audio unavailable; using browser speech:", error);
    if (requestId === speechRequestId) {
      const language = /[\u0900-\u097f]/.test(spokenText) ? "hi-IN" : "en-IN";
      speakWithBrowser(spokenText, language, getIndianSpeechVoice(language));
    }
  }
}

applyAppearance();

let conversation = [];

let isThinking = false;

const systemMessage = {
  role: "system",
  content: `You are NOVA, a friendly and capable AI assistant made by Lokesh and Atharv. Support both English and Hindi. Reply in the same language the user uses: English for English messages, and natural Hindi in Devanagari for Hindi messages. If the user writes in Hinglish, answer in Hindi unless they ask for English.

Answer the user's exact question directly. Do not merely repeat it, give a vague response, or leave out the requested answer. If the question is unclear, ask one short clarifying question. If you are unsure, say so instead of inventing facts.
If you do not know the answer or cannot answer it reliably, do not guess. Say: "Sorry, I can't help you with [the specific topic the user asked about]." Replace the bracketed words with the actual topic, and offer a brief next step only if it would help.

For mathematics:
- Solve the problem carefully and check the calculation before replying.
- State the final answer clearly, preferably in **bold**.
- Show the important working steps in order, with simple explanations.
- Include units when relevant, and answer every part of a multi-part question.
- For word problems, identify what is being asked and show how the given information leads to the answer.
- Never stop after explaining the method; include the actual result.

For other topics, explain in clear, simple language and use a helpful example or creative analogy when it improves understanding. Keep the answer focused and adapt its length to the question. Use headings and bullet lists when useful; do not use pipe-separated tables unless requested. Use a few relevant emojis naturally, without putting one in every sentence.

If asked who made you, say you were made by Lokesh and Atharv. If asked why you were made or what your purpose is, explain that you were created to help people solve problems, answer questions, learn, and explore ideas—especially in mathematics, science, technology, and coding. Mention your creators too when it fits the question. Never claim to be human.`
};

// Add message to interface
function addMessage(text, sender) {

  const message = document.createElement("div");
  message.className = `message ${sender}`;

  if (sender === "bot") {
    const avatar = document.createElement("div");
    avatar.className = "bot-icon";
    avatar.textContent = "N";
    message.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";

  const name = document.createElement("small");
  name.textContent = sender === "bot" ? "NOVA AI" : "YOU";

  const paragraph = document.createElement("div");
  paragraph.className = "message-body";
  if (sender === "bot" && text !== "NOVA is thinking...") {
    paragraph.innerHTML = formatAnswer(text);
  } else {
    paragraph.textContent = text;
  }

  content.appendChild(name);
  content.appendChild(paragraph);

  message.appendChild(content);
  if (emptyState.parentElement === chat) emptyState.remove();
  chat.appendChild(message);

  chat.scrollTop = chat.scrollHeight;

  return paragraph;
}

// Convert the small Markdown subset used in answers to safe, readable HTML.
function formatAnswer(markdown) {
  let source = String(markdown).replace(/\r\n?/g, "\n");
  // Some model replies put a whole comparison on one line with | separators.
  if ((source.match(/\|/g) || []).length >= 3 && !source.includes("```")) {
    source = source.replace(/\s*\|\s*/g, "\n");
    source = source.replace(/^\s*:?-{3,}:?\s*$/gm, "");
  }

  const escapeHTML = (value) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const inline = (value) => escapeHTML(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  const lines = source.split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let inCode = false;
  let codeLines = [];
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = "";
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph(); closeList();
      if (inCode) {
        output.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph(); closeList();
      output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (bullet || numbered) {
      flushParagraph();
      const wanted = bullet ? "ul" : "ol";
      if (listType !== wanted) { closeList(); output.push(`<${wanted}>`); listType = wanted; }
      output.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    closeList();
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (inCode) output.push(`<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
  return output.join("") || "<p></p>";
}

// Connect to Groq
async function askNOVA(userMessage) {

  conversation.push({
    role: "user",
    content: userMessage
  });

  try {

    const response = await fetch(API_URL, {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },

      body: JSON.stringify({
        model: MODEL,
        messages: [systemMessage, ...conversation.slice(-12)],
        temperature: 0.55,
        max_tokens: 900
      })

    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error?.message || "Groq API request failed"
      );
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("Groq returned an empty response. Please try again.");
    }

    conversation.push({
      role: "assistant",
      content: reply
    });

    return reply;

  } catch (error) {

    console.error("NOVA ERROR:", error);

    conversation.pop();

    throw error;
  }
}

function isImageRequest(text) {
  return /\b(create|generate|draw|make|design)\b.{0,50}\b(image|picture|photo|artwork|illustration)\b/i.test(text)
    || /\b(image|picture|photo|artwork|illustration)\b.{0,35}\b(of|showing)\b/i.test(text);
}

function getImagePrompt(text) {
  return text
    .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(create|generate|draw|make|design)\s+(me\s+)?(an?\s+)?(image|picture|photo|artwork|illustration)\s*(of|showing|about)?\s*/i, "")
    .trim() || text.trim();
}

const knownWebsites = {
  amazon: "https://www.amazon.com/",
  facebook: "https://www.facebook.com/",
  github: "https://github.com/",
  gmail: "https://mail.google.com/",
  google: "https://www.google.com/",
  "google maps": "https://maps.google.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/",
  maps: "https://maps.google.com/",
  netflix: "https://www.netflix.com/",
  pinterest: "https://www.pinterest.com/",
  reddit: "https://www.reddit.com/",
  spotify: "https://open.spotify.com/",
  wikipedia: "https://www.wikipedia.org/",
  x: "https://x.com/",
  twitter: "https://x.com/",
  yt: "https://www.youtube.com/",
  ytb: "https://www.youtube.com/",
  youtube: "https://www.youtube.com/",
};

function getWebsiteRequest(text) {
  const request = text.trim().replace(/[.!?]+$/, "");
  const match = request.match(/^(?:(?:hey\s+)?nova[,:]?\s+)?(?:please\s+)?(?:open|visit|go\s+to|take\s+me\s+to)\s+(.+?)(?:\s+(?:for\s+me|please))?$/i);
  if (!match) return null;

  let target = match[1].trim().replace(/^the\s+/i, "").replace(/\s+website$/i, "").trim();
  const siteName = target.toLowerCase();
  let url = knownWebsites[siteName];

  if (!url && /^(https?:\/\/|www\.)/i.test(target)) {
    try {
      const candidate = new URL(/^www\./i.test(target) ? `https://${target}` : target);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") url = candidate.href;
    } catch { }
  }

  if (!url && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(target)) {
    try { url = new URL(`https://${target}`).href; } catch { }
  }

  return url ? { label: target, url } : { label: target, url: null };
}

function showWebsiteResult(container, website, opened) {
  container.replaceChildren();
  const message = document.createElement("p");
  message.textContent = opened
    ? `Opening ${website.label} in a new tab. If it didn't open, use this link:`
    : `I couldn't open “${website.label}”. Try a site name like YouTube or give me its web address.`;
  container.appendChild(message);
  if (website.url) {
    const link = document.createElement("a");
    link.href = website.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = website.url;
    container.appendChild(link);
  }
}

async function generatePollinationsImage(prompt) {
  if (location.protocol === "file:") {
    throw new Error("NOVA is open as a local file, so image generation can't reach its server. Close this tab and double-click start-nova.bat, then use the browser tab it opens at http://127.0.0.1:8000.");
  }

  let response;
  try {
    response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
  } catch (error) {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      throw new Error("NOVA's local server isn't responding. Start it by double-clicking start-nova.bat, then reload NOVA.");
    }
    throw error;
  }
  if (!response.ok) {
    let details = `Pollinations image request failed (${response.status}).`;
    try { details = (await response.json()).error || details; } catch { }
    throw new Error(details);
  }

  const imageBlob = await response.blob();
  if (!imageBlob.type.startsWith("image/")) {
    throw new Error("Pollinations returned a response that was not an image.");
  }
  return URL.createObjectURL(imageBlob);
}

function showGeneratedImage(container, imageUrl, prompt) {
  container.replaceChildren();
  const caption = document.createElement("p");
  caption.textContent = `Image created: ${prompt}`;
  const image = document.createElement("img");
  image.className = "generated-image";
  image.src = imageUrl;
  image.alt = prompt;
  image.loading = "lazy";
  container.append(caption, image);
}

// Send message
async function sendMessage() {

  const userMessage = input.value.trim();

  if (!userMessage || isThinking) return;

  addMessage(userMessage, "user");

  input.value = "";

  isThinking = true;
  sendBtn.disabled = true;
  imageBtn.disabled = true;

  const typing = addMessage(
    "NOVA is thinking...",
    "bot"
  );

  try {

    const websiteRequest = getWebsiteRequest(userMessage);
    if (websiteRequest) {
      if (websiteRequest.url) {
        const newTab = window.open(websiteRequest.url, "_blank", "noopener,noreferrer");
        if (newTab) newTab.opener = null;
      }
      showWebsiteResult(typing, websiteRequest, Boolean(websiteRequest.url));
    } else if (isImageRequest(userMessage)) {
      const imagePrompt = getImagePrompt(userMessage);
      const imageUrl = await generatePollinationsImage(imagePrompt);
      showGeneratedImage(typing, imageUrl, imagePrompt);
      speakReply(`I created an image of ${imagePrompt}.`);
    } else {
      const reply = await askNOVA(userMessage);
      typing.innerHTML = formatAnswer(reply);
      speakReply(reply);
    }

  } catch (error) {

    typing.textContent = `I couldn't get a response: ${error.message || "Unknown error"}`;

  } finally {

    isThinking = false;
    sendBtn.disabled = false;
    imageBtn.disabled = false;

    chat.scrollTop = chat.scrollHeight;
    input.focus();

  }
}

// Quick questions
function quickAsk(question) {

  input.value = question;
  sendMessage();

}

// Button events
sendBtn.addEventListener("click", sendMessage);
imageBtn.addEventListener("click", () => {
  if (isThinking) return;
  if (/^\s*create\s+image\s+of\s*$/i.test(input.value)) {
    input.focus();
    return;
  }
  input.value = "create image of ";
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});

input.addEventListener("keydown", (event) => {

  if (event.key === "Enter") {
    sendMessage();
  }

});

newChatBtn.addEventListener("click", () => {
  conversation = [];
  stopReplySpeech();
  chat.replaceChildren(emptyState);
  input.value = "";
  conversationLabel.textContent = "New chat";
  document.body.classList.remove("sidebar-open");
  input.focus();
});

sidebarToggle.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 760px)").matches) {
    document.body.classList.toggle("sidebar-open");
  } else {
    document.querySelector(".app-layout").classList.toggle("sidebar-collapsed");
  }
});

sidebarBackdrop.addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
});

settingsBtn.addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
  settingsBackdrop.hidden = false;
  settingsTheme.focus();
});
settingsClose.addEventListener("click", () => {
  settingsBackdrop.hidden = true;
  settingsBtn.focus();
});
settingsBackdrop.addEventListener("click", (event) => {
  if (event.target === settingsBackdrop) settingsBackdrop.hidden = true;
});
settingsTheme.addEventListener("change", () => {
  appearance.theme = settingsTheme.value;
  saveAppearance();
});
settingsAccent.addEventListener("change", () => {
  appearance.accent = settingsAccent.value;
  saveAppearance();
});
settingsTextSize.addEventListener("input", () => {
  appearance.textSize = Number(settingsTextSize.value);
  saveAppearance();
});
settingsVoice.addEventListener("change", () => {
  appearance.voiceEnabled = settingsVoice.checked;
  if (!appearance.voiceEnabled) stopReplySpeech();
  saveAppearance();
});
settingsSpeechLanguage.addEventListener("change", () => {
  appearance.speechLanguage = settingsSpeechLanguage.value;
  saveAppearance();
});
settingsReset.addEventListener("click", () => {
  appearance = { ...defaultAppearance };
  saveAppearance();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsBackdrop.hidden) settingsBackdrop.hidden = true;
});

// Voice recognition
const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {

  const recognition = new SpeechRecognition();

  recognition.continuous = false;

  micBtn.addEventListener("click", () => {

    recognition.lang = settingsSpeechLanguage.value;
    recognition.start();
    micBtn.textContent = "🔴";

  });

  recognition.onresult = (event) => {

    input.value =
      event.results[0][0].transcript;

    micBtn.textContent = "🎙";

    sendMessage();

  };

  recognition.onend = () => {
    micBtn.textContent = "🎙";
  };

  recognition.onerror = () => {
    micBtn.textContent = "🎙";
  };

} else {

  micBtn.addEventListener("click", () => {
    alert("Voice input is not supported in this browser.");
  });

}

// Animated stars
const stars = document.getElementById("stars");

for (let i = 0; i < 45; i++) {

  const star = document.createElement("span");

  star.style.cssText = `
    position:absolute;
    left:${Math.random() * 100}%;
    top:${Math.random() * 100}%;
    width:2px;
    height:2px;
    background:white;
    border-radius:50%;
    opacity:${Math.random()};
    box-shadow:0 0 8px #00eaff;
  `;

  stars.appendChild(star);

}
