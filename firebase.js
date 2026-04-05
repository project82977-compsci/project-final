// firebase.js
// CONNECTED TO CLOUDFLARE WORKERS

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// ================= FIREBASE CONFIG =================
// 🔥 PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
//your code here
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ================= CLOUDFLARE WORKER URL =================
// ✅ FIX: Fill in your deployed worker URL below
// Run: wrangler deploy  →  copy the URL it prints  →  paste here
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const CLOUDFLARE_API_URL = isDevelopment
    ? // your worker id

console.log(`🌐 ${isDevelopment ? 'LOCAL' : 'PRODUCTION'} Worker:`, CLOUDFLARE_API_URL);

// ================= GENERIC API CALLER =================

export async function callCloudflareAPI(endpoint, data = {}, requireAuth = false) {
    try {
        const headers = { "Content-Type": "application/json" };

        if (requireAuth) {
            const user = auth.currentUser;
            if (!user) throw new Error("User not logged in");
            headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
        }

        const response = await fetch(`${CLOUDFLARE_API_URL}${endpoint}`, {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        });

        const contentType = response.headers.get("content-type");
        const result = contentType?.includes("application/json")
            ? await response.json()
            : { error: await response.text() };

        if (!response.ok) throw new Error(result.error || `API Error: ${response.status}`);
        return result;

    } catch (err) {
        console.error("❌ Cloudflare API Error:", err);
        throw err;
    }
}

// ================= AI CHAT =================

export async function generateAIChat(messages, model = null) {
    try {
        const body = { messages };
        if (model) body.model = model;

        const response = await fetch(`${CLOUDFLARE_API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const reply = data.reply
            || data.choices?.[0]?.message?.content
            || "No response from AI";

        return { reply, model: data.model, usage: data.usage };

    } catch (err) {
        console.error("❌ generateAIChat failed:", err);
        return { reply: `⚠️ AI Error: ${err.message}`, error: true };
    }
}

// ================= IMAGE ANALYSIS =================

export async function analyzeImage(imageData, prompt = "Analyze this image in detail") {
    try {
        const formattedImage = imageData.startsWith('data:')
            ? imageData
            : `data:image/jpeg;base64,${imageData}`;

        const response = await fetch(`${CLOUDFLARE_API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "nvidia/nemotron-nano-12b-2-vl:free",
                messages: [{
                    role: "user",
                    content: [
                        { type: "image_url", image_url: { url: formattedImage } },
                        { type: "text", text: prompt }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Image analysis failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return { reply: data.reply || data.choices?.[0]?.message?.content || "Could not analyze image." };

    } catch (err) {
        console.error("❌ analyzeImage failed:", err);
        return { reply: `⚠️ Image Analysis Error: ${err.message}`, error: true };
    }
}

// ================= FLASHCARD GENERATION =================
// ✅ Calls /chat directly — same as working chat page
// (avoids broken /generate-questions wrapper)
export async function generateFlashcards(topic, count = 5) {
    const response = await fetch(`${CLOUDFLARE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                {
                    role: "system",
                    content: `You are a study assistant. Generate exactly ${count} educational flashcards in valid JSON format ONLY. No markdown, no code fences, no extra text. Format: [{"question":"...","answer":"..."},...]`
                },
                {
                    role: "user",
                    content: `Generate ${count} flashcards about: ${topic}`
                }
            ]
        })
    });
    if (!response.ok) throw new Error(`Worker error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const cleaned = (data.reply || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let cards;
    try {
        const parsed = JSON.parse(cleaned);
        cards = Array.isArray(parsed) ? parsed : (parsed.flashcards || parsed.questions || []);
    } catch (e) {
        throw new Error('AI returned invalid format. Please try again.');
    }
    if (!cards.length) throw new Error('AI returned empty cards. Please try again.');
    return { flashcards: cards };
}

// ================= QUIZ GENERATION =================

export async function generateQuiz(subject, difficulty = "medium", questionCount = 10) {
    return await callCloudflareAPI("/generate-quiz", { subject, difficulty, questionCount });
}

// ================= HEALTH CHECK =================

export async function checkWorkerHealth() {
    try {
        const response = await fetch(`${CLOUDFLARE_API_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Worker health:', data);
            return true;
        }
        console.warn('⚠️ Worker health check failed:', response.status);
        return false;
    } catch (err) {
        console.error('❌ Worker unreachable:', err.message);
        return false;
    }
}

// Auto health check on load
setTimeout(async () => {
    if (CLOUDFLARE_API_URL.includes('YOUR-WORKER')) {
        console.warn('⚠️ CLOUDFLARE_API_URL not set! Update firebase.js line 22 with your worker URL.');
        return;
    }
    const ok = await checkWorkerHealth();
    if (!ok) {
        console.warn('⚠️ Worker not responding.');
        console.warn('   Local: run "wrangler dev"');
        console.warn('   Production: run "wrangler deploy" and update CLOUDFLARE_API_URL');
    }
}, 1000);

console.log("✅ Firebase initialized");
console.log("🌐 Worker URL:", CLOUDFLARE_API_URL);
console.log(`🏗️ Mode: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);