export class RateService {
  constructor() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  handleMessage(message, sender, sendResponse) {
    if (message.action === 'extensionAds.rateService.adRatingRequest') {
      this.showAdRatingNotification();
    }
  }

  showAdRatingNotification() {
    const styles = document.createElement('style');
    styles.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');

      .wrapper {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;

        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .notification-container {
        position: fixed;
        top: 40%;
        left: 40%;
        z-index: 10000;

        display: flex;
        flex-direction: column;
        gap: 15px;
        width: 410px;
        padding: 15px 20px;

        background-color: #ffffff;
        border: 1px solid transparent;
        color: black;
        font-family: 'Roboto', sans-serif;
        border-radius: 10px;
        opacity: 0;
        box-shadow:  0 0 10px rgba(0,0,0,0.2);
        animation: appear 0.5s linear forwards;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        pointer-events: all;
      }

      .notification-disappear {
        animation: disappear 0.5s linear forwards;
      }

      @keyframes disappear {
        0% {
          opacity: 1;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes appear {
        0% {
          opacity: 0;
        }
        100% {
          opacity: 1;
        }
      }

      input {
        appearance: unset;
      }

      .star {
        transition: color 0.3s;
        color: lightgray;
      }

      .star:before {
        content: '\\2605';
        font-size: 30px;
        cursor: pointer;
      }

      input:checked ~ .star,
      .star:hover,
      .star:hover ~ .star {
        color: orange;
        transition: color 0.3s;
      }

      input:checked ~ .star {
        transition: 0s;
        animation: scale 0.75s backwards;
      }

      @keyframes scale {
        0% {
          transform: scale(1);
        }

        30% {
          transform: scale(0);
        }

        60% {
          transform: scale(1.2);
        }
      }

      .close-button {
        background-color: transparent;
        cursor: pointer;
        fill: rgb(175, 175, 175);

        &:hover {
          fill: black;
        }
      }
    `;

    document.head.appendChild(styles);
    const wrapper = document.createElement('div');
    wrapper.classList.add('wrapper');
    const notificationContainer = document.createElement('div');
    notificationContainer.classList.add('notification-container');

    const notificationContent = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <p style="font-size: 22px; font-weight: 700; color: black; margin: 0; line-height: 1.3;">Rate the ads</p>
        <svg id="close-button" class="close-button" height="20px" viewBox="0 0 384 512">
          <path
            d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
          >
          </path>
        </svg>
      </div>
      <p style="font-size: 18px; color: black; font-weight: 700; margin: 0; line-height: 1.3; text-align: center;">How relevant are the ads on the page to you?</p>
      <div style="display: flex; justify-content: center; flex-direction: row-reverse; align-items: center; margin-top: 5px; height: 30px;">
        <input value="5" id="star5" type="radio">
        <label class="star" for="star5"></label>
        <input value="4" id="star4" type="radio">
        <label class="star" for="star4"></label>
        <input value="3" id="star3" type="radio">
        <label class="star" for="star3"></label>
        <input value="2" id="star2" type="radio">
        <label class="star" for="star2"></label>
        <input value="1" id="star1" type="radio">
        <label class="star" for="star1"></label>
      </div>
    `;

    notificationContainer.innerHTML = notificationContent;
    wrapper.appendChild(notificationContainer);
    document.body.appendChild(wrapper);

    document.getElementById('close-button').addEventListener('click', () => {
      this.sendResponseToService('skip');
      notificationContainer.classList.add('notification-disappear');

      setTimeout(() => {
        notificationContainer.remove();
      }, 1000)
    });

    document.querySelectorAll('input[type=radio]').forEach((button) => button.addEventListener('click', (event) => {
      const selectedValue = event.target.value;
      this.sendResponseToService(selectedValue);

      setTimeout(() => {
        notificationContainer.remove();
      }, 1000);
    }));
  }

  sendResponseToService(response) {
    chrome.runtime.sendMessage({
      action: 'extensionAds.rateService.adRatingResponse',
      response
    });
  }
}
