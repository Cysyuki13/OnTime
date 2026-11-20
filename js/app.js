import { AppController } from './controllers/AppController.js';

const app = new AppController(document.getElementById('app'));
app.start().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    `<div class="empty">初始化失敗：${e.message}</div>`;
});
