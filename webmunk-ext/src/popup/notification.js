export class Notification {
    constructor() {
      this.notification = document.getElementById('notification');
      this.notificationMessage = document.getElementById('notification-message');
    }

    show(message, duration = 3000, backgroundColor) {
      this.notificationMessage.textContent = message;
      this.notification.style.backgroundColor = backgroundColor;
      this.notification.style.display = 'block';

      setTimeout(() => {
          this.notification.style.display = 'none';
      }, duration);
    }

    error(message, duration) {
      this.show(message, duration, '#f44336');
    }

    warning(message, duration) {
      this.show(message, duration, '#ff9800');
    }

    info(message, duration) {
      this.show(message, duration, '#2196F3');
    }
}