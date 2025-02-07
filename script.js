import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    getDoc,
    query,
    where,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// ------------------------------
// Firebase Initialization
// ------------------------------
const firebaseConfig = {

        apiKey: "AIzaSyA2kATXDXl5J1xSJ_dnQjecTIy8sdjuF3Y",
        authDomain: "premiumsaeba.firebaseapp.com",
        projectId: "premiumsaeba",
        storageBucket: "premiumsaeba.firebasestorage.app",
        messagingSenderId: "976606244742",
        appId: "1:976606244742:web:c8ea116cf484783b8a4607",
        measurementId: "G-RTP77YCP1G"

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* Utility function to get URL query parameters */
function getQueryParams() {
    const params = {};
    window.location.search.substring(1)
        .split("&")
        .forEach(pair => {
            if (pair) {
                const [key, value] = pair.split("=");
                params[decodeURIComponent(key)] = decodeURIComponent(value);
            }
        });
    return params;
}

/* Simple XOR decryption for canvas image data.
   This must match the logic used in scramble.py. */
function xorDecryptImageData(imageData, key) {
    const data = imageData.data;
    const keyBytes = new TextEncoder().encode(key);
    const keyLen = keyBytes.length;
    for (let i = 0; i < data.length; i++) {
        // Skip alpha channel (every 4th byte)
        if ((i + 1) % 4 !== 0) {
            data[i] ^= keyBytes[i % keyLen];
        }
    }
    return imageData;
}

/* Verify a premium user using Firestore "users" collection.
   Returns the masterKey if credentials are valid, otherwise null.
   (In production, store hashed passwords.) */
async function verifyUser(username, password) {
    try {
        const userDoc = await getDoc(doc(db, "users", username));
        if (!userDoc.exists()) return null;
        const userData = userDoc.data();
        if (userData.password !== password) return null;
        return userData.masterKey;
    } catch (error) {
        console.error("Error verifying user:", error);
        return null;
    }
}

/* ---------- Homepage: index.html ---------- */
export async function initHomePage() {
    const comicsListDiv = document.getElementById("comicsList");
    if (!comicsListDiv) return;
    try {
        const comicsSnapshot = await getDocs(collection(db, "comics"));
        comicsSnapshot.forEach(docSnap => {
            const comic = docSnap.data();
            // Create a container for the comic
            const comicDiv = document.createElement("div");
            comicDiv.className = "comicItem";
            // Link to the comic details page (comic.html)
            comicDiv.innerHTML = `<a href="comic.html?name=${docSnap.id}">${comic.name}</a>`;
            comicsListDiv.appendChild(comicDiv);
        });
    } catch (error) {
        console.error("Error loading comics:", error);
        comicsListDiv.textContent = "Error loading comics.";
    }
}

/* ---------- Comic Details Page: comic.html ---------- */
export async function initComicPage() {
    const params = getQueryParams();
    const comicName = params.name;
    if (!comicName) return;
    const comicTitleElem = document.getElementById("comicTitle");
    const chaptersListElem = document.getElementById("chaptersList");
    try {
        // Fetch comic details from "comics" collection
        const comicDoc = await getDoc(doc(db, "comics", comicName));
        if (!comicDoc.exists()) {
            comicTitleElem.textContent = "Comic not found";
            return;
        }
        const comicData = comicDoc.data();
        comicTitleElem.textContent = comicData.name;
        // Optionally, display additional info in #comicInfo here.

        // Fetch all chapters for this comic from "chapters" collection
        const chaptersQuery = query(
            collection(db, "chapters"),
            where("comicName", "==", comicName),
            orderBy("chapterNumber")
        );
        const chaptersSnapshot = await getDocs(chaptersQuery);
        chaptersSnapshot.forEach(docSnap => {
            const chapter = docSnap.data();
            const li = document.createElement("li");
            li.innerHTML = `<a href="chapter.html?comic=${comicName}&chapter=${chapter.chapterNumber}">Chapter ${chapter.chapterNumber}</a>`;
            chaptersListElem.appendChild(li);
        });
    } catch (error) {
        console.error("Error loading comic details:", error);
    }
}

/* ---------- Chapter Page: chapter.html ---------- */
export async function initChapterPage() {
    const params = getQueryParams();
    const comicName = params.comic;
    const chapterNumber = params.chapter;
    if (!comicName || !chapterNumber) return;
    const chapterTitleElem = document.getElementById("chapterTitle");
    const contentArea = document.getElementById("contentArea");
    try {
        // Fetch comic details
        const comicDoc = await getDoc(doc(db, "comics", comicName));
        if (!comicDoc.exists()) {
            chapterTitleElem.textContent = "Comic not found";
            return;
        }
        const comicData = comicDoc.data();
        // Fetch chapter details from "chapters" collection
        // Document ID is assumed to be in the format: comicName-chapter-chapterNumber
        const chapterDoc = await getDoc(doc(db, "chapters", `${comicName}-chapter-${chapterNumber}`));
        if (!chapterDoc.exists()) {
            chapterTitleElem.textContent = "Chapter not found";
            return;
        }
        const chapterData = chapterDoc.data();
        chapterTitleElem.textContent = `${comicData.name} - Chapter ${chapterNumber}`;

        // Function to load normal (unscrambled) pages
        const loadNormalPages = () => {
            for (let page = 1; page <= chapterData.pageCount; page++) {
                const img = document.createElement("img");
                // Construct image URL: baseUrl/comicName-chapter-chapterNumber-page.png
                img.src = `${comicData.baseUrl}/${comicData.name}-chapter-${chapterNumber}-${page}.png`;
                img.alt = `Chapter ${chapterNumber} - Page ${page}`;
                img.className = "chapterImage";
                contentArea.appendChild(img);
            }
        };

        // Function to load premium pages using canvas decryption
        const loadPremiumPages = (masterKey) => {
            for (let page = 1; page <= chapterData.pageCount; page++) {
                const canvas = document.createElement("canvas");
                canvas.className = "chapterCanvas";
                contentArea.appendChild(canvas);
                const ctx = canvas.getContext("2d");
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = `${comicData.baseUrl}/${comicData.name}-chapter-${chapterNumber}-${page}.png`;
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    imageData = xorDecryptImageData(imageData, masterKey);
                    ctx.putImageData(imageData, 0, 0);
                };
                img.onerror = () => {
                    console.error("Failed to load page", page);
                };
            }
        };

        // Check comic type: if normal, load pages; if premium, prompt for login.
        if (comicData.type === "normal") {
            loadNormalPages();
        } else {
            // Create login form for premium content
            const form = document.createElement("form");
            form.id = "loginForm";
            form.innerHTML = `
        <label for="usernameInput">Patreon Username:</label>
        <input type="text" id="usernameInput" required>
        <label for="passwordInput">Password:</label>
        <input type="password" id="passwordInput" required>
        <button type="submit">Login</button>
      `;
            contentArea.appendChild(form);
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = document.getElementById("usernameInput").value;
                const password = document.getElementById("passwordInput").value;
                const masterKey = await verifyUser(username, password);
                if (masterKey) {
                    contentArea.innerHTML = ""; // Clear login form
                    loadPremiumPages(masterKey);
                } else {
                    alert("Invalid credentials. Please try again.");
                }
            });
        }
    } catch (error) {
        console.error("Error loading chapter:", error);
        chapterTitleElem.textContent = "Error loading chapter.";
    }
}

/* ---------- Initialization ---------- */
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("comicsList")) {
        initHomePage();
    } else if (document.getElementById("comicTitle") && window.location.pathname.includes("comic.html")) {
        initComicPage();
    } else if (document.getElementById("chapterTitle") && window.location.pathname.includes("chapter.html")) {
        initChapterPage();
    }
});
