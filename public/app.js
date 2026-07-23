// Automatically generate the Proxy URL based on current domain
const currentDomain = window.location.origin;
document.getElementById('proxy-url').innerText = `${currentDomain}/v1/chat/completions`;

let currentText = '';

async function loadLogs() {
    const listElement = document.getElementById('log-list');
    listElement.innerHTML = '<li class="placeholder">Loading...</li>';

    try {
        const response = await fetch('/api/logs');
        const files = await response.json();
        
        listElement.innerHTML = '';
        
        if (files.length === 0) {
            listElement.innerHTML = '<li class="placeholder">No characters scraped yet.</li>';
            return;
        }

        files.forEach(file => {
            const li = document.createElement('li');
            li.textContent = file.replace('request_', '').replace('.log', '').replace(/_/g, ' ');
            li.dataset.filename = file;
            li.onclick = () => loadFile(file, li);
            listElement.appendChild(li);
        });
    } catch (error) {
        listElement.innerHTML = '<li class="placeholder">Error loading logs.</li>';
    }
}

async function loadFile(filename, element) {
    document.getElementById('current-file').innerText = element.innerText;
    
    // Highlight active
    document.querySelectorAll('#log-list li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');

    try {
        const response = await fetch(`/logs/${filename}`);
        currentText = await response.text();
        document.getElementById('log-content').innerText = currentText;
        document.getElementById('copy-btn').disabled = false;
    } catch (error) {
        document.getElementById('log-content').innerText = 'Error loading file.';
    }
}

function copyText() {
    navigator.clipboard.writeText(currentText).then(() => {
        const btn = document.getElementById('copy-btn');
        const originalText = btn.innerText;
        btn.innerText = '✅ Copied!';
        setTimeout(() => {
            btn.innerText = originalText;
        }, 2000);
    });
}

// Load logs on startup
window.onload = loadLogs;
