export class NotificationService {
  constructor() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  private handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): void {
    if (message.action === 'webmunkExt.notificationService.extensionNotificationRequest') {
      this.showNotification(message.text);
    } else if (message.action === 'webmunkExt.worker.notifyAdPersonalization') {
      chrome.runtime.sendMessage({ action: 'webmunkExt.popup.checkSettingsReq', data: message.data })
    }
  }

  private showNotification(text: string): void {
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
        width: 430px;
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
        <p style="font-size: 22px; font-weight: 700; color: black; margin: 0; line-height: 1.3;">Notification</p>
        <svg id="close-button" class="close-button" height="20px" viewBox="0 0 384 512">
          <path
            d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
          >
          </path>
        </svg>
      </div>
      <p style="font-size: 18px; color: black; font-weight: 400; margin: 0; line-height: 1.3; text-align: center;">${text}</p>
    `;

    notificationContainer.innerHTML = notificationContent;
    wrapper.appendChild(notificationContainer);
    document.body.appendChild(wrapper);

    document.getElementById('close-button')!.addEventListener('click', () => {
      notificationContainer.classList.add('notification-disappear');
      this.sendResponseToService();

      setTimeout(() => {
        notificationContainer.remove();
      }, 1000)
    });
  }

  private sendResponseToService(): void {
    chrome.runtime.sendMessage({
      action: 'webmunkExt.notificationService.extensionNotificationResponse',
    });
  }
}