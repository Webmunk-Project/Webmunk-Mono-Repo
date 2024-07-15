const continueButton = document.getElementById('continueButton');
const emailInput = document.getElementById('emailInput');
const getStartedContainer = document.getElementById('getStartedContainer');
const studyExtensionContainer = document.getElementById('studyExtensionContainer');
const copyButton = document.getElementById('copyButton');
const randomIdentifier = document.getElementById('randomIdentifier');

getStartedContainer.style.display = 'block';
studyExtensionContainer.style.display = 'none';

continueButton.addEventListener('click', async () => {
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
        alert('E-Mail Required\nPlease enter an e-mail address to continue.');

        return;
    }

    const identifier = await hashEmail(email);
    chrome.storage.local.set({ identifier: identifier }, () => {
        getStartedContainer.style.display = 'none';
        studyExtensionContainer.style.display = 'block';
        randomIdentifier.innerHTML = identifier;
    });
});

copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(randomIdentifier.innerHTML);

    alert('Identifier copied to clipboard');
});

async function hashEmail(email) {
    const encoder = new TextEncoder();
    const data = encoder.encode(email);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode(...hashArray));
}

function displayIdentifier() {
    chrome.storage.local.get('identifier', (result) => {
        const identifier = result.identifier;

        if (identifier) {
            getStartedContainer.style.display = 'none';
            studyExtensionContainer.style.display = 'block';
            randomIdentifier.innerHTML = identifier;
        }
    });
}

displayIdentifier();
