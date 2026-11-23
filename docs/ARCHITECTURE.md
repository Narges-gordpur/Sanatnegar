# معماری نرم‌افزار صنعت‌نگار (SANATNEGAR v2.0)

## نمای کلی معماری (Modular Monolith)
صنعت‌نگار برای نگهداری آسان توسط یک توسعه‌دهنده انفرادی با معماری یکپارچه ماژولار طراحی شده است:

```
Browser (RTL UI) ──HTTP/Cookie──▶ Express Server (backend/app.js)
                                       ├── Security Layer (auth, rateLimiter, fileValidator, sanitizer)
                                       ├── Document Pipeline (PDF + Tesseract OCR, DOCX, XLSX, CSV, TXT)
                                       ├── AI Adapter (OpenAI / DeepSeek / Gemini via ENV keys)
                                       ├── Domain Services (units, conflictService, readinessService, pdfService)
                                       └── SQLite Database (WAL mode, Foreign Keys) + Private Storage/
```

## مهاجرت به PostgreSQL در آینده
ساختار `backend/database/schema.sql` با کلیدهای اصلی اتوماتیک، کلیدهای خارجی استاندارد (`REFERENCES ... ON DELETE CASCADE`) و ایندکس‌های صریح طراحی شده است. برای مهاجرت به PostgreSQL تنها کافی است لایه اتصال `backend/database/db.js` به `pg` تغییر یابد و `INTEGER PRIMARY KEY AUTOINCREMENT` به `SERIAL PRIMARY KEY` تبدیل شود.
