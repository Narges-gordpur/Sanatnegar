# راهنمای استقرار روی سرور (Deployment Guide)

۱. روی سرور لینوکس (Ubuntu/Debian) Node.js >= 20 و (برای PDF حرفه‌ای) پکیج `weasyprint` را نصب کنید:
```bash
pip install weasyprint
```
۲. فایل `.env` را از روی `.env.example` بسازید و مقادیر امن تولید را تنظیم کنید:
```env
NODE_ENV=production
DEMO_MODE=false
PORT=3000
HOST=127.0.0.1
AUTH_SECRET=<64-char-random-hex>
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
GEMINI_API_KEY=...
```
۳. برنامه را با `npm run migrate` و سپس `pm2 start backend/server.js --name sanatnegar` یا `systemd` اجرا کنید.
۴. یک Reverse Proxy مانند **Nginx** یا **Caddy** با گواهی **HTTPS (Let's Encrypt)** در مقابل پورت ۳۰۰۰ قرار دهید (`client_max_body_size 25M;`).
۵. پوشه `storage/` را به‌صورت روزانه پشتیبان‌گیری کنید و هرگز دسترسی مستقیم وب به آن ندهید.
