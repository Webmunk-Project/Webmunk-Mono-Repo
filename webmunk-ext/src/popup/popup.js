const continueButton = document.getElementById('continueButton');
const emailInput = document.getElementById('emailInput');
const getStartedContainer = document.getElementById('getStartedContainer');
const studyExtensionContainer = document.getElementById('studyExtensionContainer');
const copyButton = document.getElementById('copyButton');
const randomIdentifier = document.getElementById('randomIdentifier');
const enrollUrl = 'https://cookie-enroll.webmunk.org/enroll/enroll.json';

getStartedContainer.style.display = 'block';
studyExtensionContainer.style.display = 'none';

continueButton.addEventListener('click', () => {
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
        alert('E-Mail Required\nPlease enter an e-mail address to continue.');

        return;
    }

    const payload = {
        identifier: email,
    };

    if (payload) {
        const identifier = getRandomIdentifier();
        chrome.storage.local.set({ identifier: identifier }, function () {

            getStartedContainer.style.display = 'none';
            studyExtensionContainer.style.display = 'block';
            randomIdentifier.innerHTML = identifier;
        });
    }

    // fetch(enrollUrl, {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Accept': 'application/json'
    //     },
    //     body: JSON.stringify(payload)
    // })
    // .then((response) => {
    //     console.log('Response status:', response.status);
    //     if (!response.ok) {
    //         throw new Error(`Server error: ${response.statusText}`);
    //     }
    //     return response.json();
    // })
    // .then((data) => {
    //     console.log('Response data:', data);
    //     if (data.identifier !== undefined) {
    //         if (data.rules && data.rules['uninstall-url'] !== undefined) {
    //             chrome.runtime.setUninstallURL(data.rules['uninstall-url'].replace('<IDENTIFIER>', data.identifier));
    //
    //         chrome.storage.local.set({ enrollmentData: JSON.stringify(data) }, function () {
    //             const message = data.rules && data.rules['enrollment-confirmation']
    //                 ? data.rules['enrollment-confirmation'].join('<br /><br />')
    //                 : 'Thank you for providing your e-mail address.';
    //             document.querySelector('.main-container').innerHTML = `<p>${message}</p>`;
    //         });
    //     } else {
    //         alert('Enrollment failed\nUnable to complete enrollment. Please verify that you have a working Internet connection and your e-mail address was entered correctly.');
    //     }
    // })
    // .catch((error) => {
    //     console.error('Error:', error);
    //     alert(`Enrollment failed\nAn error occurred: ${error.message}`);
    // });
});

function getRandomIdentifier() {
    const numbers = '0123456789';
    let result = '';

    for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * numbers.length);

        result += numbers[randomIndex];
    }

    return result;
}

function displayIdentifier() {
    chrome.storage.local.get('identifier', function (result) {
        const identifier = result.identifier;

        if (identifier) {
            getStartedContainer.style.display = 'none';
            studyExtensionContainer.style.display = 'block';
            randomIdentifier.innerHTML = identifier;
        }
    });
}

displayIdentifier();

copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(randomIdentifier.innerHTML);

    alert('Identifier copied to clipboard');
});
