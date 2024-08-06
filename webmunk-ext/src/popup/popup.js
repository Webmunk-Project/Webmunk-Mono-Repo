const continueButton = document.getElementById('continueButton');
const emailInput = document.getElementById('emailInput');
const getStartedContainer = document.getElementById('getStartedContainer');
const studyExtensionContainer = document.getElementById('studyExtensionContainer');
const copyButton = document.getElementById('copyButton');
const formattedIdentifier = document.getElementById('formattedIdentifier');
let surveyLink = '';
let fullIdentifier = '';

getStartedContainer.style.display = 'block';
studyExtensionContainer.style.display = 'none';

document.addEventListener("DOMContentLoaded", () => {
  displayIdentifier();
  loadSurveyUrls();
});

function loadSurveyUrls() {
  chrome.storage.local.get('surveys', (result) => {
    const surveys = result.surveys || [];
    const taskList = document.getElementById('task-list');
    const tasksStatus = document.getElementById('tasks-status');

    taskList.innerHTML = '';

    surveys.forEach((survey) => {
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = survey.url;
      link.textContent = survey.name;
      link.target = '_blank';
      listItem.appendChild(link);
      taskList.appendChild(listItem);
    });

    tasksStatus.textContent = surveys.length ? 'Please complete these tasks:' : 'All tasks are completed!';
  });
}

continueButton.addEventListener('click', async () => {
  const email = emailInput.value.trim().toLowerCase();

  if (!email) {
    alert('E-Mail Required\nPlease enter an e-mail address to continue.');
    return;
  }

  continueButton.disabled = true;
  continueButton.textContent = 'Wait...';

  const identifier = await getIdentifier(email);

  if (!identifier) {
    alert('Enrollment hiccup!\nPlease give it another shot a bit later. We appreciate your patience!');
    continueButton.disabled = false;
    continueButton.textContent = 'Continue';
    return;
  }

  chrome.storage.local.set({ identifier: identifier }, () => {
    getStartedContainer.style.display = 'none';
    studyExtensionContainer.style.display = 'block';
    formattedIdentifier.innerHTML = formatIdentifier(identifier);
    fullIdentifier = identifier;

    chrome.runtime.sendMessage({ action: 'cookiesAppMgr.checkPrivacy' });
  });
});

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(fullIdentifier);
  alert('Identifier copied to clipboard');
});

async function getIdentifier(email) {
  try {
    const url = 'https://europe-west2-webmunk-427616.cloudfunctions.net/user-enroll';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email })
    });

    const data = await response.json();
    return data.userId;
  } catch (e) {
    console.error(e);
    return null;
  }
}

function formatIdentifier(identifier) {
  const firstTenSymbols = identifier.substring(0, 10);
  const lastTenSymbols = identifier.substring(identifier.length - 10);

  return `${firstTenSymbols}...${lastTenSymbols}`;
}

function displayIdentifier() {
  chrome.storage.local.get('identifier', (result) => {
    const identifier = result.identifier;

    if (identifier) {
      getStartedContainer.style.display = 'none';
      studyExtensionContainer.style.display = 'block';
      formattedIdentifier.innerHTML = formatIdentifier(identifier);
      fullIdentifier = identifier;
    }
  });
}
