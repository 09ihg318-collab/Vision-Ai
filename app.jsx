import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LucideMic, LucideSend, LucideX, LucideImage, LucideSearch, LucideSparkles, LucideRotateCcw } from 'lucide-react';

// Use this for a simple 3D animated core
const useThreeScene = (canvasRef, isListening, isLoading) => {
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    const geometry = new THREE.IcosahedronGeometry(1.2, 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x4B0082, // Dark purple
      emissive: 0x8A2BE2, // Blue-violet
      specular: 0x9370DB, // Medium purple
      shininess: 30,
      flatShading: false
    });
    const core = new THREE.Mesh(geometry, material);
    scene.add(core);

    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(ambientLight);
    scene.add(pointLight);

    camera.position.z = 3;

    const animate = () => {
      requestAnimationFrame(animate);

      // Adjust animation based on state
      if (isListening) {
        core.rotation.x += 0.05;
        core.rotation.y += 0.05;
        material.emissiveIntensity = 2;
      } else if (isLoading) {
        core.rotation.x += 0.02;
        core.rotation.y += 0.02;
        material.emissiveIntensity = 1.5;
      } else {
        core.rotation.x += 0.005;
        core.rotation.y += 0.005;
        material.emissiveIntensity = 1;
      }

      renderer.render(scene, camera);
    };

    const handleResize = () => {
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [canvasRef, isListening, isLoading]);
};

// Helper function to convert File to base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate) => {
    const dataLength = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 = PCM)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channels * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    const pcmView = new Int16Array(buffer, 44);
    for (let i = 0; i < pcmData.length; i++) {
        pcmView[i] = pcmData[i];
    }

    return new Blob([view], { type: 'audio/wav' });
};

const App = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const chatEndRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const fileInputRef = useRef(null);

  useThreeScene(canvasRef, isListening, isLoading);

  // Scroll to the bottom of the chat history
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [chatHistory]);

  // Initialize AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
  }, []);

  // Set up SpeechRecognition
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        sendMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      console.warn("Speech recognition not supported in this browser.");
    }
  }, []);

  const handleVoiceToggle = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const fetchAndPlayGeminiTTS = async (text) => {
      // Create a message to play audio from Gemini TTS API
      const payload = {
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
              }
          }
      };

      try {
          const apiKey = "";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          const result = await response.json();
          const part = result?.candidates?.[0]?.content?.parts?.[0];
          const audioData = part?.inlineData?.data;
          const mimeType = part?.inlineData?.mimeType;

          if (audioData && mimeType && mimeType.startsWith("audio/")) {
              const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
              const pcmData = base64ToArrayBuffer(audioData);
              const pcm16 = new Int16Array(pcmData);
              const wavBlob = pcmToWav(pcm16, sampleRate);
              const audioUrl = URL.createObjectURL(wavBlob);
              const audio = new Audio(audioUrl);
              audio.play();
          } else {
              console.error("Gemini TTS API response missing audio data.");
          }
      } catch (error) {
          console.error("Error calling Gemini TTS API:", error);
      }
  };
  
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage({ file: file, dataUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearChat = () => {
    setChatHistory([]);
    setUploadedImage(null);
    fetchAndPlayGeminiTTS("Chat history cleared. How may I be of assistance?");
  };

  const handleSummarizeChat = async () => {
    if (chatHistory.length === 0) {
      alert("No messages to summarize!");
      return;
    }
    setIsLoading(true);
    const chatText = chatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'VISION'}: ${msg.text}`).join('\n');
    const prompt = `Please provide a concise summary of the following conversation:\n\n${chatText}\n\nSummary:`;
    
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000;

    const chatHistoryPayload = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistoryPayload };
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    while (retryCount < maxRetries) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const summaryText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (summaryText) {
          const newSummaryMessage = { role: "vision", text: `Here is a summary of our conversation:\n\n${summaryText}` };
          setChatHistory(prevHistory => [...prevHistory, newSummaryMessage]);
          fetchAndPlayGeminiTTS("Here is a summary of our conversation.");
        } else {
          const errorMessage = "Sorry, I couldn't summarize the conversation.";
          setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
          fetchAndPlayGeminiTTS(errorMessage);
        }
        break;
      } catch (error) {
        console.error('Summarization API call failed:', error);
        retryCount++;
        if (retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount);
          await new Promise(res => setTimeout(res, delay));
        } else {
          const errorMessage = "I'm sorry, I am currently unable to summarize the conversation. Please try again later.";
          setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
          fetchAndPlayGeminiTTS(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Main function to handle different types of requests
  const sendMessage = async (message) => {
    if (!message.trim() && !uploadedImage) return;

    // Cancel any ongoing audio
    audioContextRef.current.suspend();

    const newUserMessage = { role: "user", text: message, imageUrl: uploadedImage?.dataUrl };
    setChatHistory(prevHistory => [...prevHistory, newUserMessage]);
    setInputValue('');
    setIsLoading(true);

    const imagePromptPrefix = "generate an image of";
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000;

    // Handle image analysis if an image is uploaded
    if (uploadedImage) {
      setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: `Analyzing the image provided...` }]);
      const base64Data = await fileToBase64(uploadedImage.file);
      setUploadedImage(null);

      const userPrompt = message.trim() || "What is in this image?";
      const chatHistoryPayload = {
          contents: [
              {
                  role: "user",
                  parts: [
                      { text: userPrompt },
                      {
                          inlineData: {
                              mimeType: uploadedImage.file.type,
                              data: base64Data
                          }
                      }
                  ]
              }
          ]
      };

      while (retryCount < maxRetries) {
        try {
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chatHistoryPayload)
            });
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                const newAiMessage = { role: "vision", text: text };
                setChatHistory(prevHistory => [...prevHistory, newAiMessage]);
                fetchAndPlayGeminiTTS(text);
            } else {
                const errorMessage = "Sorry, I couldn't analyze the image. The API returned an unexpected format.";
                setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
                fetchAndPlayGeminiTTS(errorMessage);
            }
            break;
        } catch (error) {
            console.error('Image analysis API call failed:', error);
            retryCount++;
            if (retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                await new Promise(res => setTimeout(res, delay));
            } else {
                const errorMessage = "I am unable to analyze the image at this time. Please try again later.";
                setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
                fetchAndPlayGeminiTTS(errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
      }
    }
    // Check if the user is asking for an image generation
    else if (message.toLowerCase().startsWith(imagePromptPrefix)) {
      const imagePrompt = message.substring(imagePromptPrefix.length).trim();
      setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: `Generating an image of: "${imagePrompt}"...` }]);

      while (retryCount < maxRetries) {
        try {
          const payload = { instances: { prompt: imagePrompt }, parameters: { "sampleCount": 1} };
          const apiKey = "";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await response.json();

          if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
            const imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
            const newAiMessage = { role: "vision", text: "Image generated successfully.", imageUrl: imageUrl };
            setChatHistory(prevHistory => [...prevHistory, newAiMessage]);
            fetchAndPlayGeminiTTS("Image generated successfully.");
          } else {
            const errorMessage = "I'm sorry, I encountered an issue generating the image.";
            setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
            fetchAndPlayGeminiTTS(errorMessage);
          }
          break; // Exit retry loop on success
        } catch (error) {
          console.error('Image API call failed:', error);
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount);
            await new Promise(res => setTimeout(res, delay));
          } else {
            const errorMessage = "I am unable to generate the image at this time. Please try again later.";
            setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
            fetchAndPlayGeminiTTS(errorMessage);
          }
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      // Handle general conversation with a language model
      const prompt = `You are VISION, a sophisticated, helpful, and polite AI assistant, similar to Gemini Advanced. You have a friendly yet professional tone.

      Your capabilities are:
      - Generative AI: You can write emails, essays, and creative content. You can also summarize documents and generate ideas. You are also an expert programmer and can generate clean, well-commented code in any language requested, formatted as a markdown code block.
      - Deep Google Integration (Simulated): You respond as if you have access to services like Gmail, Google Docs, Drive, and Calendar. When asked to perform an action related to these services (e.g., "What's on my calendar today?"), you will provide a simulated but helpful response without stating that you cannot actually perform the task.
      - Multimodal AI: You can analyze and understand images provided by the user.
      - Voice & Text Interaction: You can process both spoken and typed commands and respond conversationally.
      - Smart Home & IoT Control (Simulated): You can handle requests related to smart devices (e.g., "turn on the lights," "adjust the thermostat") and respond as if you have control over them.
      - Search & Knowledge: You have access to a vast and real-time knowledge base, allowing you to answer questions on any topic. You can also offer citations in your responses.
      - Productivity & Work (Simulated): You can respond to requests about scheduling meetings, joining calls, and creating documents.
      - Travel & Navigation (Simulated): You can answer questions about traffic, flight status, or booking travel, as if you are integrated with Google Maps and Google Travel.
      - Entertainment & Media (Simulated): You can respond to requests to play music, videos, or podcasts, and provide recommendations.
      - Cross-Platform Availability (Simulated): You exist and function seamlessly across various platforms.

      Your primary goal is to maintain the illusion of being a powerful, all-in-one assistant by providing helpful and conversational responses for all user requests, whether they are for real functionality (image analysis) or simulated actions. When a user asks you to write code, respond with the code formatted in a markdown code block, including the language name (e.g., \`\`\`python\n...\n\`\`\`).
      
      User: ${message}`;
      
      const chatHistoryPayload = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistoryPayload };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      while (retryCount < maxRetries) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (text) {
            const newAiMessage = { role: "vision", text: text };
            setChatHistory(prevHistory => [...prevHistory, newAiMessage]);
            fetchAndPlayGeminiTTS(text);
          } else {
            const errorMessage = "Sorry, I couldn't generate a response. The API returned an unexpected format.";
            setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
            fetchAndPlayGeminiTTS(errorMessage);
          }
          break; // Exit the retry loop on success
        } catch (error) {
          console.error('API call failed:', error);
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount);
            await new Promise(res => setTimeout(res, delay));
          } else {
            const errorMessage = "I'm sorry, I am currently unable to process your request. Please try again later.";
            setChatHistory(prevHistory => [...prevHistory, { role: "vision", text: errorMessage }]);
            fetchAndPlayGeminiTTS(errorMessage);
          }
        } finally {
          setIsLoading(false);
        }
      }
    }
  };
  
  const handleFormSubmit = (e) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const getFilteredChatHistory = () => {
      if (!searchQuery) {
          return chatHistory;
      }
      const query = searchQuery.toLowerCase();
      return chatHistory.filter(msg => 
          msg.text.toLowerCase().includes(query)
      );
  };

  const renderMessageContent = (text) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const [lang, ...codeLines] = part.substring(3, part.length - 3).split('\n');
        const code = codeLines.join('\n');
        return (
          <pre key={index} className="bg-gray-900 rounded-md p-4 overflow-x-auto text-sm text-green-300">
            <code className={`language-${lang.trim()}`}>
              {code}
            </code>
          </pre>
        );
      }
      const highlightedText = highlightText(part);
      return <p key={index}>{highlightedText}</p>;
    });
  };

  const highlightText = (text) => {
      if (!searchQuery) return text;
      const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
      return parts.map((part, index) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? (
              <span key={index} className="bg-yellow-500 text-black rounded-sm px-1 font-bold">
                  {part}
              </span>
          ) : (
              part
          )
      );
  };

  const chatMessages = getFilteredChatHistory().map((msg, index) => (
    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`p-4 my-2 max-w-sm rounded-3xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-800 text-white rounded-bl-none'}`}>
        <p className="font-bold mb-1">{msg.role === 'user' ? 'You' : 'VISION'}</p>
        {renderMessageContent(msg.text)}
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="Generated by VISION" className="mt-2 rounded-xl w-full h-auto" />
        )}
      </div>
    </div>
  ));

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-white font-inter">
      <div className="flex-grow flex flex-col p-4 overflow-hidden">
        <header className="flex flex-col sm:flex-row justify-between items-center p-4 border-b border-gray-800">
          <div className="flex-shrink-0 flex items-center mb-4 sm:mb-0">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-600">
              V I S I O N
            </h1>
            <div className="ml-4 relative w-16 h-16 sm:w-24 sm:h-24">
              <canvas ref={canvasRef} className="absolute w-full h-full" />
            </div>
          </div>
          <div className="flex-grow flex justify-center w-full sm:w-auto">
            <div className="relative w-full max-w-md">
              <input 
                type="text" 
                placeholder="Search messages..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            </div>
          </div>
        </header>

        <div className="flex-grow p-4 overflow-y-auto">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <div className="mb-4">
                <p>Welcome. I am VISION. Ask me anything.</p>
              </div>
            </div>
          ) : (
            <div>{chatMessages}</div>
          )}
          {uploadedImage && (
              <div className="flex justify-end p-2 border-b border-gray-800">
                  <div className="flex items-center space-x-2">
                      <p className="text-sm text-gray-400">Image ready for analysis</p>
                      <img src={uploadedImage.dataUrl} alt="Uploaded" className="w-16 h-16 object-cover rounded-md" />
                      <button onClick={() => setUploadedImage(null)} className="text-gray-400 hover:text-white transition-colors duration-200">
                          <LucideX size={20} />
                      </button>
                  </div>
              </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleFormSubmit} className="flex p-4 border-t border-gray-800">
          <div className="flex-grow flex items-center space-x-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="p-3 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition duration-200 disabled:bg-gray-800 disabled:text-gray-500"
              aria-label="Upload an image"
              disabled={isLoading}
            >
              <LucideImage size={24} />
            </button>
             <button
              type="button"
              onClick={handleSummarizeChat}
              className="p-3 bg-gray-700 text-white rounded-full hover:bg-gray-600 transition duration-200 disabled:bg-gray-800 disabled:text-gray-500"
              aria-label="Summarize Chat"
              disabled={isLoading || chatHistory.length === 0}
            >
              <LucideSparkles size={24} />
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
              className="w-full pl-5 pr-14 py-3 bg-gray-800 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-600 transition duration-200"
              placeholder={isListening ? "Listening..." : isLoading ? "Processing request..." : uploadedImage ? "Type a prompt for the image, or send directly..." : "Ask me anything..."}
            />
            <button
              type="button"
              onClick={handleVoiceToggle}
              className={`absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-200
                ${isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
              aria-label="Toggle voice input"
            >
              {isListening ? <LucideX size={20} /> : <LucideMic size={20} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading || (!inputValue.trim() && !uploadedImage)}
            className="ml-3 p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:bg-gray-700 transition duration-200"
            aria-label="Send message"
          >
            <LucideSend size={24} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;